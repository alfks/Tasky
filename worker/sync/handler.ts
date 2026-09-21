// `POST /api/sync` 핸들러 — 한 왕복 = 푸시 → 풀(SYNC_DESIGN.md §②-1·②-3). 요청 로우 검증은
// `@/domain/sync/remote-rows.ts#readRemoteRow` 를 그대로 쓴다(왕복 양쪽이 같은 문 하나를 쓴다,
// 그 파일 jsdoc) — 서버·클라이언트가 검증 로직을 각자 구현해 갈라지는 일이 없다.
import { readRemoteRow } from '@/domain/sync/remote-rows';
import { isSyncTable } from '@/domain/sync/wire';
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

  await userDb.touchDevice(body.deviceId, now);

  const applied: SyncApplied[] = [];
  const rejected: SyncRejected[] = [];
  for (const change of body.changes.slice(0, REQUEST_LIMIT)) {
    if (!isSyncTable(change.tbl)) {
      rejected.push({ tbl: change.tbl, id: change.id, reason: 'unknown-table' });
      continue;
    }
    const read = readRemoteRow(change.tbl, change.id, change.row);
    if (!read.ok) {
      rejected.push({ tbl: change.tbl, id: change.id, reason: 'invalid' });
      continue;
    }
    const entity = read.entity;
    const outcome = await userDb.push(
      body.deviceId,
      {
        tbl: change.tbl,
        id: change.id,
        baseSeq: change.baseSeq,
        updatedAt: entity.updatedAt,
        deleted: entity.deletedAt !== undefined,
        bodyJson: JSON.stringify(entity),
      },
      now,
    );
    if (outcome.kind === 'applied') {
      applied.push({ tbl: change.tbl, id: change.id, seq: outcome.seq });
    } else {
      rejected.push({ tbl: change.tbl, id: change.id, reason: outcome.reason });
    }
  }

  const rows = await userDb.pull(body.cursor, body.deviceId, REQUEST_LIMIT + 1);
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
  const cursor = pulledMax ?? body.cursor;
  await userDb.setDeviceLastSeq(body.deviceId, cursor);

  const response: SyncOkResponse = { cursor, applied, rejected, pulled, more, gcFloor: floor };
  return { status: 200, response };
}
