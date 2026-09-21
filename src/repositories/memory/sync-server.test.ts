// 메모리 가짜 서버 — `server-rules.vectors.ts` 를 **복사하지 않고 import** 해서 트랜스포트 왕복으로
// 돌린다(§A-3, Worker(T-93)·도메인 테스트와 같은 파일, 다른 계층). 그 밑의 seq 발급·풀·GC 불변식은
// 벡터에 없는 내용이라 이 파일이 직접 시험한다(ADR-0018 T-92 완료 조건).
import { describe, expect, it } from 'vitest';

import { SERVER_RULE_VECTORS } from '@/domain/sync/server-rules.vectors';
import {
  isResyncResponse,
  type SyncChange,
  type SyncOkResponse,
  type SyncRequest,
  type SyncTable,
} from '@/domain/sync/wire';

import { createMemorySyncServer } from '@/repositories/memory/sync-server';
import { createMemorySyncTransport } from '@/repositories/memory/sync-transport';
import type { SessionInfo } from '@/repositories/sync-transport';

const SUB = 'user-1';
const SESSION: SessionInfo = {
  sub: SUB,
  email: 'user@example.com',
  expiresAt: '2099-01-01T00:00:00.000Z',
};

function rowChange(
  tbl: SyncTable,
  id: string,
  baseSeq: number,
  updatedAt: string,
  deleted = false,
): SyncChange {
  return {
    tbl,
    id,
    baseSeq,
    row: deleted ? { id, updatedAt, deletedAt: updatedAt } : { id, updatedAt },
  };
}

function request(deviceId: string, cursor: number, changes: readonly SyncChange[]): SyncRequest {
  return { protocol: 1, deviceId, cursor, changes };
}

function expectOk(
  response: Awaited<ReturnType<ReturnType<typeof createMemorySyncTransport>['sync']>>,
): SyncOkResponse {
  expect(isResyncResponse(response)).toBe(false);
  return response as SyncOkResponse;
}

describe('메모리 가짜 서버 — server-rules.vectors.ts 트랜스포트 왕복', () => {
  it.each(SERVER_RULE_VECTORS)('$name', async (vector) => {
    let now = vector.receivedAt;
    const server = createMemorySyncServer();
    const transport = createMemorySyncTransport(server, SESSION, { now: () => now });

    if (vector.existing !== undefined) {
      // 클램프가 시드 값을 건드리지 않도록, 시드 push 의 수신 시각은 existing.updatedAt 자체로 둔다.
      now = vector.existing.updatedAt;
      const seeded = await transport.sync(
        request('device-seed', 0, [
          rowChange(
            vector.existing.tbl,
            vector.existing.id,
            0,
            vector.existing.updatedAt,
            vector.existing.deleted,
          ),
        ]),
      );
      expectOk(seeded);
    }

    now = vector.receivedAt;
    const response = expectOk(
      await transport.sync(
        request('device-a', 0, [
          rowChange(
            vector.change.tbl,
            vector.change.id,
            vector.change.baseSeq,
            vector.change.updatedAt,
          ),
        ]),
      ),
    );

    if (vector.expected === 'insert' || vector.expected === 'update') {
      expect(response.applied.map((a) => a.id)).toEqual([vector.change.id]);
      expect(response.rejected).toEqual([]);
    } else {
      const reason =
        vector.expected === 'reject-exists'
          ? 'exists'
          : vector.expected === 'reject-stale'
            ? 'stale'
            : 'invalid';
      expect(response.rejected).toEqual([{ tbl: vector.change.tbl, id: vector.change.id, reason }]);
      expect(response.applied).toEqual([]);
    }
  });
});

describe('메모리 가짜 서버 — seq 불변식', () => {
  it('한 배치 500건이 서로 다른 seq 로 오름차순 applied 된다', async () => {
    const server = createMemorySyncServer();
    const transport = createMemorySyncTransport(server, SESSION);
    const changes = Array.from({ length: 500 }, (_, i) =>
      rowChange('todos', `id-${String(i)}`, 0, '2026-01-01T00:00:00.000Z'),
    );

    const response = expectOk(await transport.sync(request('writer', 0, changes)));

    expect(response.applied).toHaveLength(500);
    const seqs = response.applied.map((a) => a.seq);
    expect(new Set(seqs).size).toBe(500);
    expect(seqs).toEqual([...seqs].sort((a, b) => a - b));
  });

  it('여러 왕복에 걸쳐 seq 가 단조 증가한다', async () => {
    const server = createMemorySyncServer();
    const transport = createMemorySyncTransport(server, SESSION);

    const first = expectOk(
      await transport.sync(
        request('writer', 0, [rowChange('todos', 'a', 0, '2026-01-01T00:00:00.000Z')]),
      ),
    );
    const second = expectOk(
      await transport.sync(
        request('writer', 0, [rowChange('todos', 'b', 0, '2026-01-02T00:00:00.000Z')]),
      ),
    );

    expect(second.applied[0]?.seq).toBeGreaterThan(first.applied[0]?.seq ?? 0);
  });
});

describe('메모리 가짜 서버 — 풀', () => {
  it('자기 기기가 쓴 로우는 자신의 풀 결과에서 빠지고 다른 기기에는 보인다', async () => {
    const server = createMemorySyncServer();
    const transport = createMemorySyncTransport(server, SESSION);
    await transport.sync(
      request('device-a', 0, [rowChange('todos', 'x', 0, '2026-01-01T00:00:00.000Z')]),
    );

    const pullFromA = expectOk(await transport.sync(request('device-a', 0, [])));
    expect(pullFromA.pulled).toEqual([]);

    const pullFromB = expectOk(await transport.sync(request('device-b', 0, [])));
    expect(pullFromB.pulled.map((p) => p.id)).toEqual(['x']);
  });

  it('501건이면 500건 + more:true, 다음 커서로 나머지를 받는다', async () => {
    const server = createMemorySyncServer();
    const writer = createMemorySyncTransport(server, SESSION);
    const changes = Array.from({ length: 501 }, (_, i) =>
      rowChange('todos', `id-${String(i)}`, 0, '2026-01-01T00:00:00.000Z'),
    );
    await writer.sync(request('writer', 0, changes.slice(0, 500)));
    await writer.sync(request('writer', 0, changes.slice(500)));

    const reader = createMemorySyncTransport(server, SESSION);
    const firstPull = expectOk(await reader.sync(request('reader', 0, [])));
    expect(firstPull.pulled).toHaveLength(500);
    expect(firstPull.more).toBe(true);

    const secondPull = expectOk(await reader.sync(request('reader', firstPull.cursor, [])));
    expect(secondPull.pulled).toHaveLength(1);
    expect(secondPull.more).toBe(false);
  });

  it('cursor 가 GC 플로어보다 뒤처지면 resync 를 받는다', async () => {
    const server = createMemorySyncServer();
    server.setGcFloor(SUB, 50);
    const transport = createMemorySyncTransport(server, SESSION);

    const response = await transport.sync(request('device-a', 10, []));

    expect(isResyncResponse(response)).toBe(true);
    if (isResyncResponse(response)) {
      expect(response.gcFloor).toBe(50);
    }
  });
});
