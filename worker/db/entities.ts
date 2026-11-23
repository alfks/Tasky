// `entities`·`devices` 테이블 SQL — 이 파일의 모든 문장은 `sub = ?` 를 직접 바인딩한다
// (`scripts/check-worker-sql.sh` 가 `worker/db/**` 전체에 강제, SYNC_DESIGN.md §②-5 항목 2).
// `sub` 를 아는 호출부는 `worker/db/user-db.ts#forUser` 뿐이다 — 이 파일의 함수들은 `sub` 를
// 매번 인자로 받지만, **호출 경로가 하나(user-db.ts)뿐**이라는 사실은 그 파일의 타입이 강제한다.
//
// **판정은 `@/domain/sync/server-rules.ts#applyServerRules` 를 그대로 부른다**(§A-2, Worker 가
// domain/sync 를 import 하는 형태) — 이 파일이 판정 로직을 다시 구현하지 않는다. 다만 **동시성의
// 최종 방어선은 SQL 자체**다: `applyServerRules` 호출은 두 SQL 문(생성/갱신) 중 어느 쪽을 실행할지
// 고르는 데만 쓰고, "실제로 적용됐는가"는 항상 그 SQL 문의 `RETURNING`(원자적 `ON CONFLICT … WHERE`)
// 결과로 판정한다 — 두 요청이 거의 동시에 같은 로우를 건드려도(§②-5 격리 테스트와 별개로, 같은
// 사용자의 두 기기가 같은 로우를 동시에 밀어 넣는 경우) SELECT 이후의 경쟁 상태가 최종 판정을
// 뒤집을 수 없다.
import { applyServerRules, clampFutureUpdatedAt } from '@/domain/sync/server-rules';
import type { ServerChange } from '@/domain/sync/server-rules';
import type { SyncTable } from '@/domain/sync/wire';

import { sql } from './sql';

export type PushInput = {
  tbl: SyncTable;
  id: string;
  baseSeq: number;
  updatedAt: string;
  deleted: boolean;
  bodyJson: string;
  /** ADR-0026: 구버전 설정 쓰기의 누락된 프로필을 원자적으로 보존한다. */
  preserveProfile?: boolean;
};

export type ApplyOutcome =
  { kind: 'applied'; seq: number } | { kind: 'rejected'; reason: 'exists' | 'stale' | 'invalid' };

const CREATE_SQL = sql`INSERT INTO entities (sub, tbl, id, seq, deleted, device_id, updated_at, body)
  VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(seq),0)+1 FROM entities WHERE sub = ?1), ?4, ?5, ?6, ?7)
  ON CONFLICT(sub,tbl,id) DO NOTHING
  RETURNING seq`;
const UPDATE_SQL = sql`INSERT INTO entities (sub, tbl, id, seq, deleted, device_id, updated_at, body)
  VALUES (?1, ?2, ?3, (SELECT COALESCE(MAX(seq),0)+1 FROM entities WHERE sub = ?1), ?4, ?5, ?6, ?7)
  ON CONFLICT(sub,tbl,id) DO UPDATE SET
    seq = excluded.seq, deleted = excluded.deleted, device_id = excluded.device_id,
    updated_at = excluded.updated_at,
    body = CASE WHEN ?8 = 1 AND excluded.tbl = 'settings'
      AND excluded.deleted = 0 AND entities.deleted = 0 THEN
      json_patch(excluded.body, json_object(
        'profileName', COALESCE(json_extract(excluded.body, '$.profileName'), json_extract(entities.body, '$.profileName')),
        'profileBio', COALESCE(json_extract(excluded.body, '$.profileBio'), json_extract(entities.body, '$.profileBio')),
        'profileAvatar', COALESCE(json_extract(excluded.body, '$.profileAvatar'), json_extract(entities.body, '$.profileAvatar')),
        'profileVersion', COALESCE(json_extract(excluded.body, '$.profileVersion'), json_extract(entities.body, '$.profileVersion'))
      )) ELSE excluded.body END
  WHERE entities.updated_at <= excluded.updated_at
  RETURNING seq`;

export async function pushOne(
  db: D1Database,
  sub: string,
  deviceId: string,
  input: PushInput,
  receivedAt: string,
): Promise<ApplyOutcome> {
  const change: ServerChange = {
    tbl: input.tbl,
    id: input.id,
    baseSeq: input.baseSeq,
    updatedAt: input.updatedAt,
  };
  // 형식 검사만 한다(`existing` 없이 부르면 결과는 `insert` 아니면 `reject-invalid` 뿐이다). 있음/없음·
  // `updatedAt` 판정은 아래 SQL 이 **원자적으로** 한다(`ON CONFLICT … WHERE`) — 미리 SELECT 로 읽어 두면
  // 같은 판정을 두 번 하면서 변경 한 건당 D1 쿼리가 두 번이 돼 호출당 쿼리 상한(`wire.ts#
  // MAX_PUSH_CHANGES`)에 두 배로 빨리 닿는다.
  const verdict = applyServerRules(undefined, change, receivedAt);
  if (verdict === 'reject-invalid') {
    return { kind: 'rejected', reason: 'invalid' };
  }

  const isCreateAttempt = input.baseSeq === 0;
  // 생성·갱신 모두 클램프한다 — 생성만 건너뛰면 미래 시각(시계 어긋난 기기)이 그대로 저장돼,
  // 그 뒤 정상 시각의 모든 갱신·삭제가 LWW 에서 영구히 져 로우가 동결된다(§0 상태 블록 1번, ADR-0005).
  const storedUpdatedAt = clampFutureUpdatedAt(input.updatedAt, receivedAt);
  const stmt = isCreateAttempt ? CREATE_SQL : UPDATE_SQL;
  const result = await db
    .prepare(stmt)
    .bind(
      sub,
      input.tbl,
      input.id,
      input.deleted ? 1 : 0,
      deviceId,
      storedUpdatedAt,
      input.bodyJson,
      ...(isCreateAttempt ? [] : [input.preserveProfile ? 1 : 0]),
    )
    .run<{ seq: number }>();
  const applied = result.results[0];
  if (!applied) {
    return { kind: 'rejected', reason: isCreateAttempt ? 'exists' : 'stale' };
  }
  return { kind: 'applied', seq: applied.seq };
}

export type PulledRow = { tbl: SyncTable; id: string; seq: number; body: string };

/** 풀 — 자기 기기 제외, seq 오름차순, `limit+1` 건을 받아 "더 있음" 을 판정한다(§②-3). */
export async function pull(
  db: D1Database,
  sub: string,
  cursor: number,
  deviceId: string,
  limit: number,
  includeOwnSettings = false,
): Promise<PulledRow[]> {
  const rows = await db
    .prepare(
      sql`SELECT tbl, id, seq, body FROM entities WHERE sub = ?
        AND ((seq > ? AND device_id <> ?) OR (? = 1 AND tbl = 'settings')) ORDER BY seq LIMIT ?`,
    )
    .bind(sub, cursor, deviceId, includeOwnSettings ? 1 : 0, limit)
    .all<PulledRow>();
  return rows.results;
}

export async function touchDevice(
  db: D1Database,
  sub: string,
  deviceId: string,
  now: string,
): Promise<void> {
  await db
    .prepare(
      sql`INSERT INTO devices (sub, device_id, seen_at) VALUES (?, ?, ?)
        ON CONFLICT(sub, device_id) DO UPDATE SET seen_at = excluded.seen_at`,
    )
    .bind(sub, deviceId, now)
    .run();
}

export async function setDeviceLastSeq(
  db: D1Database,
  sub: string,
  deviceId: string,
  lastSeq: number,
): Promise<void> {
  await db
    .prepare(sql`UPDATE devices SET last_seq = ? WHERE sub = ? AND device_id = ?`)
    .bind(lastSeq, sub, deviceId)
    .run();
}

export async function gcFloor(db: D1Database, sub: string): Promise<number> {
  const row = await db
    .prepare(sql`SELECT gc_floor FROM users WHERE sub = ?`)
    .bind(sub)
    .first<{ gc_floor: number }>();
  return row?.gc_floor ?? 0;
}

/** 계정 삭제 — 명시 DELETE 3문장(`PRAGMA foreign_keys` 가 꺼져 있어도 결과가 같다, ADR-0019). */
export async function deleteAllForUser(db: D1Database, sub: string): Promise<void> {
  await db.batch([
    db.prepare(sql`DELETE FROM entities WHERE sub = ?`).bind(sub),
    db.prepare(sql`DELETE FROM devices WHERE sub = ?`).bind(sub),
  ]);
}
