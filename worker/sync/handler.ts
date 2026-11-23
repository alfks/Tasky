// `POST /api/sync` 핸들러 — 한 왕복 = 푸시 → 풀(SYNC_DESIGN.md §②-1·②-3). 요청 로우 검증은
// `@/domain/sync/remote-rows.ts#readRemoteRow` 를 그대로 쓴다(왕복 양쪽이 같은 문 하나를 쓴다,
// 그 파일 jsdoc) — 서버·클라이언트가 검증 로직을 각자 구현해 갈라지는 일이 없다.
import { readRemoteRow } from '@/domain/sync/remote-rows';
import { clampFutureUpdatedAt } from '@/domain/sync/server-rules';
import { MAX_PUSH_CHANGES, isSyncTable } from '@/domain/sync/wire';
import type {
  PulledRow,
  SyncApplied,
  SyncOkResponse,
  SyncRejected,
  SyncRequest,
  SyncResponse,
} from '@/domain/sync/wire';

import type { UserDb } from '../db/user-db';

const REQUEST_LIMIT = 500;

function isSyncRequest(value: unknown): value is SyncRequest {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v.protocol === 1 &&
    typeof v.deviceId === 'string' &&
    v.deviceId.length > 0 &&
    typeof v.cursor === 'number' &&
    Array.isArray(v.changes)
  );
}

export async function handleSync(
  body: unknown,
  userDb: UserDb,
  now: string,
): Promise<{ status: 200 | 400; response: SyncResponse | { error: string } }> {
  if (!isSyncRequest(body)) {
    return { status: 400, response: { error: 'malformed sync request' } };
  }

  const floor = await userDb.gcFloor();
  if (body.cursor < floor) {
    return { status: 200, response: { resync: true, gcFloor: floor } };
  }

  // 후속 티켓으로 미룬다(이번 PR 소관 아님) — 유휴 폴링(빈 `changes`, 새 풀 결과 없음)에서도
  // 이 줄과 아래 `setDeviceLastSeq` 가 매번 무조건 2행을 쓴다. 지금 `devices.last_seq` 를 **읽는**
  // 코드는 레포에 0건이다(worker/**·src/** grep 실측) — 그 값을 실제로 쓰는 자리가 생기기 전까지는
  // 오늘 그 쓰기가 아무것도 사지 않는다는 뜻이다. `gc_floor` GC 구현이 그 자리가 될 가능성이 높다.
  await userDb.touchDevice(body.deviceId, now);

  const applied: SyncApplied[] = [];
  const rejected: SyncRejected[] = [];
  // 앞쪽 `MAX_PUSH_CHANGES` 건만 처리한다 — 뒷부분은 응답에 없으니 클라이언트 아웃박스에 남아 다음
  // 왕복에서 처리된다(`wire.ts#MAX_PUSH_CHANGES` jsdoc: 호출당 D1 쿼리 상한).
  for (const change of body.changes.slice(0, MAX_PUSH_CHANGES)) {
    // `changes` 원소 형식은 `isSyncRequest` 가 배열 여부만 보고 원소 하나하나는 검증하지 않는다
    // (`SyncRequest.changes: readonly SyncChange[]` 는 타입일 뿐 런타임 보장이 아니다). `null` 원소는
    // `change.tbl` 접근에서 그대로 던져 요청 전체를 500 으로 죽인다 — 숫자·문자열은 프로퍼티 접근이
    // `undefined` 로 안전히 떨어져 아래 `isSyncTable` 관문에서 `unknown-table` 로 걸러지지만 `null`
    // 만은 던진다. 그 로우만 `invalid` 로 거절하고 나머지는 계속 처리한다(§②-3 "그 로우만 invalid").
    if ((change as unknown) === null) {
      rejected.push({ tbl: 'todos', id: '', reason: 'invalid' });
      continue;
    }
    if (!isSyncTable(change.tbl)) {
      rejected.push({ tbl: change.tbl, id: change.id, reason: 'unknown-table' });
      continue;
    }
    const read = readRemoteRow(change.tbl, change.id, change.row);
    if (!read.ok) {
      rejected.push({ tbl: change.tbl, id: change.id, reason: 'invalid' });
      continue;
    }
    // 저장되는 컬럼(`entities.updated_at`)은 `pushOne` 이 항상 클램프한다(worker/db/entities.ts) —
    // 여기서 같은 클램프를 미리 적용해 두지 않으면 body(JSON)에는 클라이언트가 보낸 **원본** 미래
    // 시각이 그대로 실리고 컬럼에는 클램프된 값이 저장돼, 같은 로우의 컬럼과 body 가 서로 다른
    // updatedAt 을 갖게 된다(풀로 돌아오는 값은 body 쪽이라 클라이언트가 그 어긋남을 그대로 받는다).
    // `clampFutureUpdatedAt` 은 멱등이라(같은 receivedAt 이면 두 번 불러도 같은 값) `pushOne` 이
    // 다시 클램프해도 결과가 바뀌지 않는다.
    const entity = { ...read.entity, updatedAt: clampFutureUpdatedAt(read.entity.updatedAt, now) };
    const outcome = await userDb.push(
      body.deviceId,
      {
        tbl: change.tbl,
        id: change.id,
        baseSeq: change.baseSeq,
        updatedAt: entity.updatedAt,
        deleted: entity.deletedAt !== undefined,
        bodyJson: JSON.stringify(entity),
        preserveProfile:
          change.tbl === 'settings' &&
          (body.settingsProfileVersion !== 1 ||
            !('profileVersion' in read.entity) ||
            read.entity.profileVersion !== 1),
      },
      now,
    );
    if (outcome.kind === 'applied') {
      applied.push({ tbl: change.tbl, id: change.id, seq: outcome.seq });
    } else {
      rejected.push({ tbl: change.tbl, id: change.id, reason: outcome.reason });
    }
  }

  const rows = await userDb.pull(
    body.cursor,
    body.deviceId,
    REQUEST_LIMIT + 1,
    body.settingsProfileVersion === 1 && body.includeOwnSettings === true,
  );
  const more = rows.length > REQUEST_LIMIT;
  const page = rows.slice(0, REQUEST_LIMIT);
  const pulled: PulledRow[] = page.map((r) => ({
    tbl: r.tbl,
    id: r.id,
    seq: r.seq,
    row: JSON.parse(r.body) as unknown,
  }));

  // wire.ts jsdoc: "이 응답까지 받은 seq(풀 결과의 max, 없으면 요청 그대로)". 이 기기 자신이 지금
  // 막 밀어 넣은 change 의 seq(applied[].seq)는 넣지 않는다 — 풀은 `device_id <> ?` 로 자기 기기를
  // 제외하므로, 커서를 그 seq 까지 앞당기면 **같은 요청 구간에 다른 기기가 끼워 넣은 로우**를
  // 다음 풀에서 건너뛸 수 있다(자기 seq 가 다른 기기 seq 사이에 낄 수 있으므로).
  const pulledMax = pulled.length > 0 ? Math.max(...pulled.map((r) => r.seq)) : undefined;
  const cursor = Math.max(body.cursor, pulledMax ?? body.cursor);
  await userDb.setDeviceLastSeq(body.deviceId, cursor);

  const response: SyncOkResponse = { cursor, applied, rejected, pulled, more, gcFloor: floor };
  return { status: 200, response };
}
