import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCategory, updateCategory } from '@/domain/category/category.rules';
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
    logoutOthers: async () => {},
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
    forgetProfileLocal: () => {},
    reloadProfile: async () => {},
  };
  return { rt, state };
}

describe('sync-engine: 프로필 재조회 회복', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetEngineForTest();
    setRepositories(createMemoryRepositories());
  });

  afterEach(() => {
    resetEngineForTest();
    vi.useRealTimers();
  });

  it('첫 재조회가 실패해도 다음 정상 왕복에서 다시 읽는다', async () => {
    const { transport } = fakeTransport([], {
      sub: 'profile-sync',
      email: 'a@example.com',
      expiresAt: '',
    });
    setSyncTransport(transport);
    await getRepositories().sync.setState({ deviceId: 'd1', userSub: 'profile-sync', cursor: 0 });
    const { rt } = fakeRuntime();
    const reload = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValue(undefined);
    rt.reloadProfile = reload;
    startEngine(rt);
    await vi.advanceTimersByTimeAsync(0);
    expect(reload).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it('진행 중 들어온 포커스 트리거를 첫 왕복 뒤 다시 실행한다', async () => {
    let finishFirst!: (response: SyncResponse) => void;
    const firstResponse = new Promise<SyncResponse>((resolve) => {
      finishFirst = resolve;
    });
    let calls = 0;
    const { transport } = fakeTransport([], {
      sub: 'profile-sync',
      email: 'a@example.com',
      expiresAt: '',
    });
    transport.sync = async () => {
      calls += 1;
      return calls === 1
        ? firstResponse
        : { cursor: 0, applied: [], rejected: [], pulled: [], more: false, gcFloor: 0 };
    };
    setSyncTransport(transport);
    await getRepositories().sync.setState({ deviceId: 'd1', userSub: 'profile-sync', cursor: 0 });
    const { rt } = fakeRuntime();
    startEngine(rt);
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(1);

    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(2_000);
    expect(calls).toBe(1);
    finishFirst({ cursor: 0, applied: [], rejected: [], pulled: [], more: false, gcFloor: 0 });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toBe(2);
  });
});

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

describe('sync-engine: 연속 invalid 3회 격리(돌연변이 6 대상)', () => {
  let visibility: DocumentVisibilityState = 'visible';

  beforeEach(() => {
    vi.useFakeTimers();
    resetEngineForTest();
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: () => visibility,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  });

  it('같은 (tbl,id) 가 3회 연속 invalid 로 거절되면 격리하고 아웃박스에서 지운다', async () => {
    visibility = 'visible';
    await getRepositories().sync.wipeLocal();
    const category = createCategory(
      { name: '격리 대상', color: '#CFEB8F', existing: [] },
      { now: () => '2026-09-21T00:00:00.000Z', id: () => crypto.randomUUID() },
    );
    await getRepositories().categories.upsert(category);
    await getRepositories().sync.enqueueAll();
    await getRepositories().sync.setState({ deviceId: 'd1', userSub: 's', cursor: 0 });

    const rejected = { tbl: 'categories' as const, id: category.id, reason: 'invalid' as const };
    const { transport, calls } = fakeTransport(
      [
        { cursor: 0, applied: [], rejected: [rejected], pulled: [], more: false, gcFloor: 0 },
        { cursor: 0, applied: [], rejected: [rejected], pulled: [], more: false, gcFloor: 0 },
        { cursor: 0, applied: [], rejected: [rejected], pulled: [], more: false, gcFloor: 0 },
      ],
      { sub: 's', email: 'e', expiresAt: '' },
    );
    setSyncTransport(transport);

    const { rt } = fakeRuntime();
    startEngine(rt);
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));

    // 2번째·3번째 사이클 — 30초 폴링으로 자연스럽게 돈다(엔진 트리거를 직접 흉내내지 않는다).
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(3));

    await vi.waitFor(async () => {
      const outbox = await getRepositories().sync.countOutbox();
      expect(outbox).toBe(0); // 3회째 격리되며 아웃박스에서도 지워진다
    });
    const state = await getRepositories().sync.getState();
    expect(state?.quarantined).toEqual([{ tbl: 'categories', id: category.id }]);
  });

  it('연속이 아니면(중간에 성공) 격리하지 않는다 — ackApplied 의 카운터 리셋 대상', async () => {
    visibility = 'visible';
    await getRepositories().sync.wipeLocal();
    const category = createCategory(
      { name: '연속 아님', color: '#CFEB8F', existing: [] },
      { now: () => '2026-09-21T00:00:00.000Z', id: () => crypto.randomUUID() },
    );
    await getRepositories().categories.upsert(category);
    await getRepositories().sync.enqueueAll();
    await getRepositories().sync.setState({ deviceId: 'd1', userSub: 's', cursor: 0 });

    const invalid = { tbl: 'categories' as const, id: category.id, reason: 'invalid' as const };
    const applied = { tbl: 'categories' as const, id: category.id, seq: 1 };
    const { transport, calls } = fakeTransport(
      [
        { cursor: 0, applied: [], rejected: [invalid], pulled: [], more: false, gcFloor: 0 }, // 1회
        { cursor: 0, applied: [], rejected: [invalid], pulled: [], more: false, gcFloor: 0 }, // 2회
        { cursor: 1, applied: [applied], rejected: [], pulled: [], more: false, gcFloor: 0 }, // 성공 — 리셋
        { cursor: 1, applied: [], rejected: [invalid], pulled: [], more: false, gcFloor: 0 }, // 다시 1회
      ],
      { sub: 's', email: 'e', expiresAt: '' },
    );
    setSyncTransport(transport);

    const { rt } = fakeRuntime();
    startEngine(rt);
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(1));
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(2));
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(async () => {
      // 3번째 사이클(성공)이 반영돼 아웃박스가 비어야 다음 단언이 의미 있다.
      expect(await getRepositories().sync.countOutbox()).toBe(0);
    });
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.waitFor(() => expect(calls.length).toBeGreaterThanOrEqual(4));

    const state = await getRepositories().sync.getState();
    expect(state?.quarantined ?? []).toEqual([]); // 연속 3회가 아니므로 격리되지 않는다
  });
});

describe('sync-engine: ackApplied 는 실제로 푸시한 rev 로 대조한다(회귀 방지)', () => {
  beforeEach(() => {
    resetEngineForTest();
  });

  it('푸시 왕복 중 같은 로우를 다시 고치면 ack 가 그 편집을 아웃박스에서 지우지 않는다', async () => {
    await getRepositories().sync.wipeLocal();
    const category = createCategory(
      { name: '원래 이름', color: '#CFEB8F', existing: [] },
      { now: () => '2026-09-21T00:00:00.000Z', id: () => crypto.randomUUID() },
    );
    await getRepositories().categories.upsert(category);
    await getRepositories().sync.enqueueAll(); // rev 1 로 큐 적재
    await getRepositories().sync.setState({ deviceId: 'd1', userSub: 's', cursor: 0 });

    // sync() 를 호출부가 원할 때 풀어줄 수 있도록 응답을 보류한다 — "왕복이 아직 안 끝남"을 흉내낸다.
    let resolveSync: ((response: SyncResponse) => void) | undefined;
    const calls: SyncRequest[] = [];
    setSyncTransport({
      me: async () => ({ sub: 's', email: 'e', expiresAt: '' }),
      sync: async (request) => {
        calls.push(request);
        return new Promise<SyncResponse>((resolve) => {
          resolveSync = resolve;
        });
      },
      logout: async () => {},
      deleteAccount: async () => {},
      logoutOthers: async () => {},
    });

    const { rt } = fakeRuntime();
    startEngine(rt);
    await vi.waitFor(() => expect(calls.length).toBe(1)); // rev=1 을 실었고 응답 대기 중

    // 응답이 오기 전에 같은 로우를 다시 고친다 — 아웃박스 rev 가 2로 오른다.
    const edited = updateCategory(category, { name: '고친 이름' }, [], {
      now: () => '2026-09-21T00:00:01.000Z',
      id: () => crypto.randomUUID(),
    });
    await getRepositories().categories.upsert(edited);
    expect(await getRepositories().sync.countOutbox()).toBe(1);

    // 서버가 이제야 rev=1 시점 push 를 applied 로 확인해 준다.
    resolveSync?.({
      cursor: 1,
      applied: [{ tbl: 'categories', id: category.id, seq: 1 }],
      rejected: [],
      pulled: [],
      more: false,
      gcFloor: 0,
    });

    await vi.waitFor(async () => {
      const state = await getRepositories().sync.getState();
      expect(state?.cursor).toBe(1); // 이 사이클이 끝났음을 기다린다
    });
    // rev=2 편집은 아직 서버에 보내지 못했으니 아웃박스에 남아 있어야 한다.
    expect(await getRepositories().sync.countOutbox()).toBe(1);
    const stored = await getRepositories().categories.getById(category.id);
    expect(stored?.name).toBe('고친 이름'); // 편집이 사라지지 않았다
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

describe('sync-engine: 오프라인 중에도 pendingCount 가 정직하다(R6, e2e 로 드러난 회귀)', () => {
  beforeEach(() => {
    resetEngineForTest();
  });

  it('네트워크 왕복 없이도 로컬 아웃박스 건수를 즉시 반영한다', async () => {
    await getRepositories().sync.wipeLocal();
    await getRepositories().sync.setState({ deviceId: 'd1', userSub: 's', cursor: 0 });
    const category = createCategory(
      { name: '오프라인', color: '#CFEB8F', existing: [] },
      { now: () => '2026-09-21T00:00:00.000Z', id: () => crypto.randomUUID() },
    );
    await getRepositories().categories.upsert(category);
    await getRepositories().sync.enqueueAll(); // 오프라인 상태의 로컬 쓰기를 흉내낸다

    // sync() 를 부르면 실패하는 트랜스포트 — 오프라인 시뮬레이션. 그래도 pendingCount 는 갱신돼야 한다.
    setSyncTransport({
      me: async () => {
        throw new Error('offline');
      },
      sync: async () => {
        throw new Error('offline');
      },
      logout: async () => {},
      deleteAccount: async () => {},
      logoutOthers: async () => {},
    });
    const originalOnLine = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });

    const { rt, state } = fakeRuntime();
    startEngine(rt);
    await vi.waitFor(() => expect(state.pendingCount).toBe(1));

    if (originalOnLine) Object.defineProperty(navigator, 'onLine', originalOnLine);
  });
});

describe('sync-engine: pendingCount 는 엔진 사이클을 기다리지 않는다(리뷰 Minor 5)', () => {
  beforeEach(() => {
    resetEngineForTest();
  });

  it('사이클이 네트워크 왕복에 걸려 있어도(running=true) 로컬 쓰기 직후 대기 건수가 즉시 반영된다', async () => {
    await getRepositories().sync.wipeLocal();
    await getRepositories().sync.setState({ deviceId: 'd1', userSub: 's', cursor: 0 });

    // 첫 사이클의 sync() 가 영원히 안 끝난다 — `running` 가드가 계속 참으로 남아, 이 사이클이
    // 끝나야만 도는 옛 경로(cycleOnce 안의 pendingCount 갱신)라면 이 테스트가 절대 통과할 수
    // 없다. `onLocalWrite` 에서 직접 `countOutbox` 를 읽는 새 경로만 이 상황에서도 반영된다.
    setSyncTransport({
      me: async () => ({ sub: 's', email: 'e', expiresAt: '' }),
      sync: () => new Promise<never>(() => {}),
      logout: async () => {},
      deleteAccount: async () => {},
      logoutOthers: async () => {},
    });

    const { rt, state } = fakeRuntime();
    startEngine(rt);
    await vi.waitFor(() => expect(state.pendingCount).toBe(0)); // 첫 사이클 진입, sync() 에서 대기 중

    const category = createCategory(
      { name: '즉시 반영', color: '#CFEB8F', existing: [] },
      { now: () => '2026-09-21T00:00:00.000Z', id: () => crypto.randomUUID() },
    );
    await getRepositories().categories.upsert(category); // 아웃박스 적재 + notifyLocalWrite

    await vi.waitFor(() => expect(state.pendingCount).toBe(1));
  });
});

describe('sync-engine: 계정 삭제 안내가 뜬 뒤 다음 사이클(같은 근본 원인 — 1회성 신호를 계속 버림)', () => {
  beforeEach(() => {
    resetEngineForTest();
    // 위 "온라인/오프라인" 테스트가 navigator.onLine 을 false 로 바꾼 뒤 원래 값이 own property 가
    // 아니면(getOwnPropertyDescriptor 가 undefined) 복원하지 못하고 새는 경우가 있다 — 이 사이클은
    // 온라인 전제이므로 여기서 명시적으로 되돌린다(다른 테스트의 순서에 기대지 않는다).
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
  });

  it('accountDeletedNotice 가 이미 떠 있으면 그다음 사이클의 401(me()===null)이 표식·안내를 지우지 않는다', async () => {
    await getRepositories().sync.wipeLocal();
    await getRepositories().sync.setState({
      deviceId: 'd1',
      userSub: 's',
      userEmail: 'a@example.com',
      cursor: 0,
    });
    // 계정 삭제 직후 서버가 세션 행·쿠키를 지웠으므로 그다음 me() 는 410 이 아니라 평범한
    // 401(=null) 이다 — verifySession 의 session===null 갈래가 이 사이클에서도 그대로 도는지가
    // 이 테스트의 핵심(리뷰: 안내가 뜬 뒤에도 엔진이 계속 30초마다 이 갈래를 탄다).
    const meMock = vi.fn(async () => null);
    setSyncTransport({
      me: meMock,
      sync: async () => ({
        cursor: 0,
        applied: [],
        rejected: [],
        pulled: [],
        more: false,
        gcFloor: 0,
      }),
      logout: async () => {},
      deleteAccount: async () => {},
      logoutOthers: async () => {},
    });

    const { rt, state } = fakeRuntime();
    state.accountDeletedNotice = true; // 이전 사이클이 이미 안내를 띄웠다고 가정
    startEngine(rt);

    await vi.waitFor(() => expect(meMock).toHaveBeenCalled());
    await vi.waitFor(async () => {
      const after = await getRepositories().sync.getState();
      expect(after?.userSub).toBe('s'); // 표식을 지우면 안 된다 — 사용자가 안내를 확인하기 전까지는
    });

    expect(state.accountDeletedNotice).toBe(true); // 안내가 그대로 살아 있어야 한다
    expect(state.phase).not.toBe('login'); // 로그인 화면으로 되돌아가 안내를 무너뜨리면 안 된다
  });
});
