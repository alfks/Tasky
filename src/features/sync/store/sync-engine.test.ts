import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCategory } from '@/domain/category/category.rules';
import type { SyncRequest, SyncResponse } from '@/domain/sync/wire';

import { getRepositories, setRepositories, setSyncTransport } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';
import { createMemorySyncServer } from '@/repositories/memory/sync-server';
import { createMemorySyncTransport } from '@/repositories/memory/sync-transport';
import type { SessionInfo, SyncTransport } from '@/repositories/sync-transport';

import { resetEngineForTest, startEngine } from '@/features/sync/store/sync-engine';
import type { SyncRuntime, SyncStoreState } from '@/features/sync/store/sync-store';

/** 응답을 미리 준 순서대로 돌려주는 트랜스포트 — 엔진의 사이클·재실행 로직만 겨냥한다. */
function fakeTransport(
  responses: SyncResponse[],
  session: SessionInfo | null,
): {
  transport: SyncTransport;
  calls: SyncRequest[];
} {
  const calls: SyncRequest[] = [];
  const queue = [...responses];
  const transport: SyncTransport = {
    me: async () => session,
    sync: async (request) => {
      calls.push(request);
      return (
        queue.shift() ?? {
          cursor: 0,
          applied: [],
          rejected: [],
          pulled: [],
          more: false,
          gcFloor: 0,
        }
      );
    },
    logout: async () => {},
    deleteAccount: async () => {},
  };
  return { transport, calls };
}

function fakeRuntime(): { rt: SyncRuntime; state: Partial<SyncStoreState> } {
  const state: Partial<SyncStoreState> = { dataRevision: 0, pendingCount: 0 };
  const rt: SyncRuntime = {
    getState: () => state as SyncStoreState,
    setState: (partial) => {
      const next = typeof partial === 'function' ? partial(state as SyncStoreState) : partial;
      Object.assign(state, next);
    },
    getExportBackup: () => null,
    ensureEngineStarted: async () => {},
  };
  return { rt, state };
}

describe('sync-engine: 트리거 — 보이는 동안에만 폴링(돌연변이 5 대상)', () => {
  let visibility: DocumentVisibilityState = 'visible';

  beforeEach(() => {
    vi.useFakeTimers();
    resetEngineForTest();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
    setSyncTransport(fakeTransport([], null).transport); // 표식 없음 → 사이클은 즉시 signed-out
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('숨김 상태로 시작하면 30초 뒤에도 sync() 를 다시 부르지 않는다', async () => {
    visibility = 'hidden';
    const { transport, calls } = fakeTransport([], { sub: 's', email: 'e', expiresAt: '' });
    setSyncTransport(transport);
    await getRepositories().sync.setState({ deviceId: 'd1', userSub: 's', cursor: 0 });

    const { rt } = fakeRuntime();
    startEngine(rt);
    await vi.runOnlyPendingTimersAsync(); // 첫 사이클(runCycle 즉시 호출분)이 끝나길 기다린다
    const afterFirstCycle = calls.length;

    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls.length).toBe(afterFirstCycle); // 숨김이면 폴링 타이머가 없다
  });

  it('보이는 상태에서는 30초마다 다시 돈다', async () => {
    visibility = 'visible';
    const { transport, calls } = fakeTransport(
      [
        { cursor: 0, applied: [], rejected: [], pulled: [], more: false, gcFloor: 0 },
        { cursor: 0, applied: [], rejected: [], pulled: [], more: false, gcFloor: 0 },
      ],
      { sub: 's', email: 'e', expiresAt: '' },
    );
    setSyncTransport(transport);
    await getRepositories().sync.setState({ deviceId: 'd1', userSub: 's', cursor: 0 });

    const { rt } = fakeRuntime();
    startEngine(rt);
    await vi.runOnlyPendingTimersAsync();
    const afterFirstCycle = calls.length;

    await vi.advanceTimersByTimeAsync(30_000);
    await vi.runOnlyPendingTimersAsync();
    expect(calls.length).toBeGreaterThan(afterFirstCycle);
  });
});

describe('sync-engine: more 응답이면 즉시 재실행한다(돌연변이 1 대상)', () => {
  beforeEach(() => {
    resetEngineForTest();
  });

  it('more: true 인 응답 다음에 sync() 를 한 번 더 부른다', async () => {
    await getRepositories().sync.wipeLocal();
    await getRepositories().sync.setState({ deviceId: 'd1', userSub: 's', cursor: 0 });
    const { transport, calls } = fakeTransport(
      [
        { cursor: 1, applied: [], rejected: [], pulled: [], more: true, gcFloor: 0 },
        { cursor: 2, applied: [], rejected: [], pulled: [], more: false, gcFloor: 0 },
      ],
      { sub: 's', email: 'e', expiresAt: '' },
    );
    setSyncTransport(transport);

    const { rt } = fakeRuntime();
    startEngine(rt);
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));
  });
});

describe('sync-engine: dataRevision (돌연변이 2 대상)', () => {
  beforeEach(() => {
    resetEngineForTest();
  });

  it('풀로 받은 로우가 없으면 dataRevision 이 그대로다', async () => {
    await getRepositories().sync.wipeLocal();
    await getRepositories().sync.setState({ deviceId: 'd1', userSub: 's', cursor: 0 });
    const { transport } = fakeTransport(
      [{ cursor: 0, applied: [], rejected: [], pulled: [], more: false, gcFloor: 0 }],
      { sub: 's', email: 'e', expiresAt: '' },
    );
    setSyncTransport(transport);
    const { rt, state } = fakeRuntime();
    startEngine(rt);
    await vi.waitFor(() => expect(state.pendingCount).toBe(0));
    expect(state.dataRevision).toBe(0);
  });

  it('두 기기(실제 메모리 서버) — A 가 쓴 카테고리가 B 로 넘어오면 B 의 dataRevision 이 오른다', async () => {
    const server = createMemorySyncServer();
    const session: SessionInfo = { sub: 'user-1', email: 'u@example.com', expiresAt: '' };

    // 기기 A: 카테고리 하나 만들고 아웃박스에 적재 → 사이클로 푸시.
    const repoA = createMemoryRepositories();
    setRepositories(repoA);
    const category = createCategory(
      { name: '운동', color: '#CFEB8F', existing: [] },
      { now: () => '2026-09-21T00:00:00.000Z', id: () => crypto.randomUUID() },
    );
    await repoA.categories.upsert(category);
    await repoA.sync.enqueueAll();
    await repoA.sync.setState({ deviceId: 'device-a', userSub: session.sub, cursor: 0 });
    setSyncTransport(createMemorySyncTransport(server, session));
    const rtA = fakeRuntime().rt;
    startEngine(rtA);
    await vi.waitFor(async () => expect(await repoA.sync.countOutbox()).toBe(0));

    // 기기 B: 새 저장소·새 엔진 인스턴스로 같은 서버를 당긴다.
    resetEngineForTest();
    const repoB = createMemoryRepositories();
    setRepositories(repoB);
    await repoB.sync.setState({ deviceId: 'device-b', userSub: session.sub, cursor: 0 });
    setSyncTransport(createMemorySyncTransport(server, session));
    const { rt: rtB, state: stateB } = fakeRuntime();
    startEngine(rtB);

    await vi.waitFor(async () => {
      const categories = await repoB.categories.list({ includeClosed: true });
      expect(categories).toHaveLength(1);
    });
    expect(stateB.dataRevision).toBe(1);
  });
});
