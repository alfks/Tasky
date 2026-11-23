// 대기 변경이 한 요청(`MAX_PUSH_CHANGES`)보다 많을 때 — 첫 로그인 업로드·대량 정렬·루틴 채우기가 만드는
// 백로그를 엔진이 **한 사이클 안에서** 묶음마다 끊어 끝까지 올리는가. 서버가 요청당 처리 상한을 두는 건
// Workers 의 호출당 D1 쿼리 상한 때문이고(`wire.ts#MAX_PUSH_CHANGES`), 상한 없이 500건을 보내던 때는
// 요청이 통째로 실패해 그 기기가 보내기도 받기도 못 했다.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { adopt } from '@/domain/meta';
import { MAX_PUSH_CHANGES } from '@/domain/sync/wire';
import type { SyncRequest } from '@/domain/sync/wire';

import { setRepositories, setSyncTransport } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';
import { createMemorySyncServer } from '@/repositories/memory/sync-server';
import { createMemorySyncTransport } from '@/repositories/memory/sync-transport';
import type { SessionInfo, SyncTransport } from '@/repositories/sync-transport';

import { resetEngineForTest, startEngine } from '@/features/sync/store/sync-engine';
import type { SyncRuntime, SyncStoreState } from '@/features/sync/store/sync-store';
import { makeTodo } from '@/test/fixtures/todo';

function fakeRuntime(): SyncRuntime {
  const state: Partial<SyncStoreState> = { dataRevision: 0, pendingCount: 0 };
  return {
    getState: () => state as SyncStoreState,
    setState: (partial) => {
      Object.assign(
        state,
        typeof partial === 'function' ? partial(state as SyncStoreState) : partial,
      );
    },
    getExportBackup: () => null,
    ensureEngineStarted: async () => {},
    forgetProfileLocal: () => {},
    reloadProfile: async () => {},
  };
}

describe('sync-engine: 요청 상한보다 큰 백로그', () => {
  beforeEach(() => {
    resetEngineForTest();
  });
  afterEach(() => {
    resetEngineForTest();
  });

  it('100건 백로그가 한 사이클에 묶음으로 끊겨 모두 올라가고, 다른 기기가 전부 받는다', async () => {
    const server = createMemorySyncServer();
    const session: SessionInfo = { sub: 'backlog-user', email: 'u@example.com', expiresAt: '' };
    const total = 100;

    // 기기 A — 한 번도 동기화하지 않은 할 일 100건(첫 로그인 업로드의 enqueueAll 과 같은 모양).
    const repoA = createMemoryRepositories();
    setRepositories(repoA);
    for (let seq = 1; seq <= total; seq += 1) {
      await repoA.todos.upsert(adopt(makeTodo({ seq })));
    }
    await repoA.sync.enqueueAll();
    await repoA.sync.setState({ deviceId: 'device-a', userSub: session.sub, cursor: 0 });

    const base = createMemorySyncTransport(server, session);
    const sizes: number[] = [];
    const recording: SyncTransport = {
      ...base,
      sync: (request: SyncRequest) => {
        sizes.push(request.changes.length);
        return base.sync(request);
      },
    };
    setSyncTransport(recording);
    startEngine(fakeRuntime());

    // 사이클 한 번(= startEngine 의 첫 runCycle)이 끝나면 아웃박스가 비어 있어야 한다 — 다음 폴링을
    // 기다리지 않는다. 폴링(30초)·디바운스를 기다리지 않고 비는 것을 본다.
    await expect
      .poll(async () => repoA.sync.countOutbox(), { timeout: 10_000, interval: 50 })
      .toBe(0);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(MAX_PUSH_CHANGES);
    expect(sizes.filter((n) => n > 0).length).toBeGreaterThanOrEqual(
      Math.ceil(total / MAX_PUSH_CHANGES),
    );

    // 기기 B — 같은 서버에서 전부 받는다.
    resetEngineForTest();
    const repoB = createMemoryRepositories();
    setRepositories(repoB);
    await repoB.sync.setState({ deviceId: 'device-b', userSub: session.sub, cursor: 0 });
    setSyncTransport(createMemorySyncTransport(server, session));
    startEngine(fakeRuntime());
    await expect
      .poll(async () => (await repoB.todos.listAll()).length, { timeout: 10_000, interval: 50 })
      .toBe(total);
  }, 30_000);
});
