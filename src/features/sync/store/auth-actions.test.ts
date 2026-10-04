import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCategory } from '@/domain/category/category.rules';
import type { SyncState } from '@/domain/sync/wire';

import { getRepositories, setSyncTransport } from '@/repositories/container';
import { createMemorySyncServer } from '@/repositories/memory/sync-server';
import { createMemorySyncTransport } from '@/repositories/memory/sync-transport';

import { createHttpSyncTransport } from '@/infra/sync/http-transport';

import { PROFILE_MIRROR_KEY, useProfileStore } from '@/features/profile';
import {
  acknowledgeAccountDeleted,
  confirmAccountSwitch,
  deferUpload,
  performDeleteAccount,
  performLogout,
  performLogoutOthers,
  probeSession,
  resolveUploadChoice,
  resumeIfDeferred,
  verifySession,
} from '@/features/sync/store/auth-actions';
import type { SyncRuntime } from '@/features/sync/store/sync-store';

const deps = { now: () => '2026-09-21T00:00:00.000Z', id: () => 'id-1' };

function fakeRuntime(initial: Partial<{ dataRevision: number }> = {}) {
  const state: Record<string, unknown> = { dataRevision: 0, ...initial };
  const ensureEngineStarted = vi.fn(async () => {});
  let exportBackup: (() => Promise<boolean>) | null = null;
  const rt: SyncRuntime = {
    getState: () => state as never,
    setState: (partial) => {
      const next = typeof partial === 'function' ? partial(state as never) : partial;
      Object.assign(state, next);
    },
    getExportBackup: () => exportBackup,
    ensureEngineStarted,
    forgetProfileLocal: () => useProfileStore.getState().forgetLocal(),
    reloadProfile: () => useProfileStore.getState().reloadFromStorage(),
  };
  return {
    rt,
    state,
    ensureEngineStarted,
    setExportBackup: (fn: (() => Promise<boolean>) | null) => (exportBackup = fn),
  };
}

describe('auth-actions: verifySession — 401/전환 처리(R1)', () => {
  beforeEach(async () => {
    await getRepositories().sync.wipeLocal();
  });

  it('표식이 없으면 signed-out', async () => {
    const { rt } = fakeRuntime();
    expect(await verifySession(rt)).toBe('signed-out');
  });

  it('me() 가 null 이면 표식을 지우되(userSub 없음) deviceId 는 유지하고, 로컬 데이터는 지우지 않는다', async () => {
    await getRepositories().sync.setState({
      deviceId: 'device-1',
      userSub: 'sub-1',
      userEmail: 'a@example.com',
      cursor: 3,
    });
    const category = createCategory({ name: '공부', color: '#CFEB8F', existing: [] }, deps);
    await getRepositories().categories.upsert(category);

    setSyncTransport(createMemorySyncTransport(createMemorySyncServer(), null)); // session=null → me() 는 null
    const { rt, state } = fakeRuntime();
    const result = await verifySession(rt);

    expect(result).toBe('signed-out');
    expect(state.phase).toBe('login');
    const after = await getRepositories().sync.getState();
    expect(after?.deviceId).toBe('device-1'); // deviceId 유지
    expect(after?.userSub).toBeUndefined(); // 표식만 지움
    const categories = await getRepositories().categories.list({ includeClosed: true });
    expect(categories).toHaveLength(1); // 401 은 로컬을 지우지 않는다
  });

  // 리뷰 Major 2: 감지 즉시 지우지 않는다 — 안내만 띄우고 사용자 확인(confirmAccountSwitch)을
  // 기다린다. 아래 describe 가 확인 흐름을 별도로 검증한다.
  it('sub 가 다르면 switch-pending — 안내만 띄우고 로컬·표식은 그대로다', async () => {
    await getRepositories().sync.setState({
      deviceId: 'device-1',
      userSub: 'sub-old',
      userEmail: 'old@example.com',
      cursor: 5,
    });
    const category = createCategory({ name: '옛 계정', color: '#CFEB8F', existing: [] }, deps);
    await getRepositories().categories.upsert(category);
    setSyncTransport(
      createMemorySyncTransport(createMemorySyncServer(), {
        sub: 'sub-new',
        email: 'new@example.com',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
    );
    const { rt, state } = fakeRuntime();
    expect(await verifySession(rt)).toBe('switch-pending');
    expect(state.accountSwitchedNotice).toBe(true);
    const categories = await getRepositories().categories.list({ includeClosed: true });
    expect(categories).toHaveLength(1); // 아직 안 지웠다
    const after = await getRepositories().sync.getState();
    expect(after).toMatchObject({ deviceId: 'device-1', userSub: 'sub-old', cursor: 5 }); // 표식도 그대로
  });
});

describe('auth-actions: confirmAccountSwitch(R1, 리뷰 Major 2)', () => {
  beforeEach(async () => {
    await getRepositories().sync.wipeLocal();
  });

  it('exportBackup 성공 시 로컬을 지우고 새 표식으로 cursor 0 을 연다', async () => {
    await getRepositories().sync.setState({
      deviceId: 'device-1',
      userSub: 'sub-old',
      userEmail: 'old@example.com',
      cursor: 5,
    });
    const category = createCategory({ name: '옛 계정', color: '#CFEB8F', existing: [] }, deps);
    await getRepositories().categories.upsert(category);
    setSyncTransport(
      createMemorySyncTransport(createMemorySyncServer(), {
        sub: 'sub-new',
        email: 'new@example.com',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
    );
    const { rt, state } = fakeRuntime();
    state.accountSwitchedNotice = true;
    const ok = await confirmAccountSwitch(rt, async () => true);

    expect(ok).toBe(true);
    expect(state.accountSwitchedNotice).toBe(false);
    const categories = await getRepositories().categories.list({ includeClosed: true });
    expect(categories).toHaveLength(0); // wipeLocal 이 실제로 지웠다
    const after = await getRepositories().sync.getState();
    expect(after).toMatchObject({ deviceId: 'device-1', userSub: 'sub-new', cursor: 0 });
  });

  it('새 표식에는 lastSyncedAt 이 없다 — 첫 동기화 전까지 시드가 미뤄진다(first-sync)', async () => {
    await getRepositories().sync.setState({
      deviceId: 'device-1',
      userSub: 'sub-old',
      cursor: 5,
      lastSyncedAt: '2026-01-01T00:00:00.000Z',
    });
    setSyncTransport(
      createMemorySyncTransport(createMemorySyncServer(), {
        sub: 'sub-new',
        email: 'new@example.com',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
    );
    const { rt } = fakeRuntime();
    await confirmAccountSwitch(rt, async () => true);

    const after = await getRepositories().sync.getState();
    expect(after?.lastSyncedAt).toBeUndefined();
  });

  it('exportBackup 이 실패/취소면 아무것도 지우지 않는다', async () => {
    await getRepositories().sync.setState({
      deviceId: 'device-1',
      userSub: 'sub-old',
      userEmail: 'old@example.com',
      cursor: 5,
    });
    const category = createCategory({ name: '옛 계정', color: '#CFEB8F', existing: [] }, deps);
    await getRepositories().categories.upsert(category);
    setSyncTransport(
      createMemorySyncTransport(createMemorySyncServer(), {
        sub: 'sub-new',
        email: 'new@example.com',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
    );
    const { rt } = fakeRuntime();
    const ok = await confirmAccountSwitch(rt, async () => false);

    expect(ok).toBe(false);
    const categories = await getRepositories().categories.list({ includeClosed: true });
    expect(categories).toHaveLength(1);
    const after = await getRepositories().sync.getState();
    expect(after?.userSub).toBe('sub-old'); // 아직 그대로
  });
});

describe('auth-actions: 계정 삭제 안내(sync.md §6, ADR-0019 — E-3 성공 기준)', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    await getRepositories().sync.wipeLocal();
    await getRepositories().sync.setState({
      deviceId: 'device-b',
      userSub: 'sub-1',
      userEmail: 'a@example.com',
      cursor: 7,
    });
    const category = createCategory({ name: '다른 기기', color: '#CFEB8F', existing: [] }, deps);
    await getRepositories().categories.upsert(category);
    global.fetch = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: 'account-deleted' }), {
          status: 410,
          headers: { 'Content-Type': 'application/json' },
        }),
    );
    setSyncTransport(createHttpSyncTransport());
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('워커가 실제로 주는 모양(410 + {error:"account-deleted"})을 받으면 안내 플래그가 켜지고 로컬은 그대로다', async () => {
    const { rt, state } = fakeRuntime();
    const result = await verifySession(rt);

    expect(result).toBe('account-deleted');
    expect(state.accountDeletedNotice).toBe(true);
    const after = await getRepositories().sync.getState();
    expect(after?.userSub).toBe('sub-1'); // 표식을 지우지 않는다 — 조용히 로그아웃시키지 않는다
    const categories = await getRepositories().categories.list({ includeClosed: true });
    expect(categories).toHaveLength(1); // 로컬 데이터도 그대로
  });

  it('acknowledgeAccountDeleted 확인 후에야 내보내고 지운다', async () => {
    const { rt, state } = fakeRuntime();
    await verifySession(rt); // 안내를 먼저 띄운다
    expect(state.accountDeletedNotice).toBe(true);

    const exportBackup = vi.fn(async () => true);
    const ok = await acknowledgeAccountDeleted(rt, exportBackup);

    expect(ok).toBe(true);
    expect(exportBackup).toHaveBeenCalledTimes(1);
    expect(state.phase).toBe('login');
    expect(state.accountDeletedNotice).toBe(false);
    const categories = await getRepositories().categories.list({ includeClosed: true });
    expect(categories).toHaveLength(0);
  });

  it('내보내기를 취소하면 아무것도 지우지 않는다', async () => {
    const { rt, state } = fakeRuntime();
    await verifySession(rt);

    const ok = await acknowledgeAccountDeleted(rt, async () => false);

    expect(ok).toBe(false);
    expect(state.phase).toBeUndefined(); // 아직 안 바뀜
    const categories = await getRepositories().categories.list({ includeClosed: true });
    expect(categories).toHaveLength(1);
  });
});

describe('auth-actions: resolveUploadChoice(R7)', () => {
  beforeEach(async () => {
    await getRepositories().sync.wipeLocal();
  });

  it('export-wipe 가 exportBackup 실패면 wipeLocal 을 부르지 않는다', async () => {
    const { rt } = fakeRuntime();
    const exportBackup = vi.fn(async () => false);
    const ok = await resolveUploadChoice(rt, 'export-wipe', exportBackup);
    expect(ok).toBe(false);
  });

  it('선택이 끝나면 uploadPrompt 뿐 아니라 uploadPending 도 함께 꺼진다(리뷰 Major 4)', async () => {
    await getRepositories().sync.setState({
      deviceId: 'device-1',
      userSub: 'sub-1',
      userEmail: 'a@example.com',
      cursor: 0,
    });
    const { rt, state } = fakeRuntime();
    state.uploadPrompt = true;
    state.uploadPending = true;
    const ok = await resolveUploadChoice(rt, 'upload', async () => true);
    expect(ok).toBe(true);
    expect(state.uploadPrompt).toBe(false);
    expect(state.uploadPending).toBe(false);
  });
});

describe('auth-actions: deferUpload·resumeIfDeferred(R7 보류 — 리뷰 Major 4)', () => {
  beforeEach(async () => {
    await getRepositories().sync.wipeLocal();
  });

  it('deferUpload 은 표식에 uploadDeferred 를 남기고 엔진을 시작한다("결정하지 않겠다"지 "안 올리겠다"가 아니다)', async () => {
    await getRepositories().sync.setState({
      deviceId: 'device-1',
      userSub: 'sub-1',
      userEmail: 'a@example.com',
      cursor: 0,
    });
    const { rt, ensureEngineStarted } = fakeRuntime();
    await deferUpload(rt);
    expect(ensureEngineStarted).toHaveBeenCalledTimes(1);
    const after = await getRepositories().sync.getState();
    expect(after?.uploadDeferred).toBe(true);
  });

  it('resumeIfDeferred 는 로컬 데이터가 남아 있으면 다음 접속에서 다시 uploadPrompt 를 켠다(R7 스펙 그대로)', async () => {
    const state: SyncState = {
      deviceId: 'device-1',
      userSub: 'sub-1',
      userEmail: 'a@example.com',
      cursor: 0,
      uploadDeferred: true,
    };
    await getRepositories().sync.setState(state);
    const category = createCategory({ name: '보류분', color: '#CFEB8F', existing: [] }, deps);
    await getRepositories().categories.upsert(category);

    const { rt, state: rtState } = fakeRuntime();
    await resumeIfDeferred(rt, state);
    expect(rtState.uploadPrompt).toBe(true);
    expect(rtState.uploadPending).toBe(true);
  });

  it('resumeIfDeferred 는 그사이 로컬 데이터가 없어졌으면 표식만 지우고 조용히 넘어간다', async () => {
    const state: SyncState = {
      deviceId: 'device-1',
      userSub: 'sub-1',
      userEmail: 'a@example.com',
      cursor: 0,
      uploadDeferred: true,
    };
    await getRepositories().sync.setState(state);

    const { rt, state: rtState } = fakeRuntime();
    await resumeIfDeferred(rt, state);
    expect(rtState.uploadPrompt).toBeUndefined();
    const after = await getRepositories().sync.getState();
    expect(after?.uploadDeferred).toBe(false);
  });
});

describe('auth-actions: 로그아웃·계정 삭제 — 내보내기 실패면 아무것도 안 한다', () => {
  it('performLogout 은 exportBackup 이 false 면 false 를 돌려주고 phase 를 안 바꾼다', async () => {
    const { rt, state } = fakeRuntime();
    const signal = vi.fn();
    window.addEventListener('tasky-social-logout', signal);
    const ok = await performLogout(rt, async () => false);
    window.removeEventListener('tasky-social-logout', signal);
    expect(signal).not.toHaveBeenCalled();
    expect(ok).toBe(false);
    expect(state.phase).toBeUndefined();
  });

  it('승인된 로컬 정리 뒤 서버 응답보다 먼저 명시적 로그아웃을 알린다', async () => {
    const category = createCategory({ name: '공부', color: '#CFEB8F', existing: [] }, deps);
    await getRepositories().categories.upsert(category);
    const observed: Promise<unknown>[] = [];
    const signal = () => observed.push(getRepositories().categories.getById(category.id));
    window.addEventListener('tasky-social-logout', signal);
    const base = createMemorySyncTransport(createMemorySyncServer(), null);
    const logout = vi.fn(async () => {
      expect(observed).toHaveLength(1);
      expect(await observed[0]).toBeUndefined();
    });
    setSyncTransport({ ...base, logout });
    try {
      expect(await performLogout(fakeRuntime().rt, async () => true)).toBe(true);
      expect(logout).toHaveBeenCalledTimes(1);
    } finally {
      window.removeEventListener('tasky-social-logout', signal);
    }
  });

  it('performDeleteAccount 는 exportBackup 이 false 면 false', async () => {
    const { rt } = fakeRuntime();
    const ok = await performDeleteAccount(rt, async () => false);
    expect(ok).toBe(false);
  });
});

describe('auth-actions: probeSession', () => {
  it('세션이 없으면 아무것도 하지 않는다', async () => {
    setSyncTransport(createMemorySyncTransport(createMemorySyncServer(), null));
    const { rt, state } = fakeRuntime();
    await probeSession(rt);
    expect(state.phase).toBeUndefined();
  });
});

describe('auth-actions: performLogoutOthers(ADR-0020 §결정 5, 리뷰 Major 1)', () => {
  const originalFetch = global.fetch;

  beforeEach(async () => {
    await getRepositories().sync.wipeLocal();
    await getRepositories().sync.setState({
      deviceId: 'device-1',
      userSub: 'sub-1',
      userEmail: 'a@example.com',
      cursor: 3,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('성공하면 ok — 이 기기의 표식·로컬 데이터는 그대로다(리뷰 Minor 4: 실제로 확인한다)', async () => {
    setSyncTransport(
      createMemorySyncTransport(createMemorySyncServer(), {
        sub: 'sub-1',
        email: 'a@example.com',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
    );
    const category = createCategory({ name: '다기기', color: '#CFEB8F', existing: [] }, deps);
    await getRepositories().categories.upsert(category);
    const { rt } = fakeRuntime();

    expect(await performLogoutOthers(rt)).toBe('ok');

    const state = await getRepositories().sync.getState();
    expect(state?.userSub).toBe('sub-1'); // 이 기기는 로그인 상태 그대로
    const categories = await getRepositories().categories.list({ includeClosed: true });
    expect(categories).toHaveLength(1); // 로컬 데이터도 그대로
  });

  it('오프라인이면 offline — 게이트를 건드리지 않는다', async () => {
    setSyncTransport(
      createMemorySyncTransport(
        createMemorySyncServer(),
        { sub: 'sub-1', email: 'a@example.com', expiresAt: '2099-01-01T00:00:00.000Z' },
        { offline: true },
      ),
    );
    const { rt, state } = fakeRuntime();

    expect(await performLogoutOthers(rt)).toBe('offline');
    expect(state.phase).toBeUndefined();
  });

  it('이 기기 세션이 이미 죽었으면(401) signed-out — verifySession 이 다음 사이클을 기다리지 않고 게이트를 넘긴다', async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 401 }));
    setSyncTransport(createHttpSyncTransport());
    const { rt, state } = fakeRuntime();

    expect(await performLogoutOthers(rt)).toBe('signed-out');
    expect(state.phase).toBe('login');
  });

  it('계정이 다른 기기에서 삭제됐으면(410) signed-out — 계정 삭제 안내를 곧장 띄운다(1회성 410 을 삼키지 않는다)', async () => {
    // 실제 서버 순서(worker/auth/session.ts#requireSession + handlers.ts#sessionErrorResponse):
    // logout-others 의 410 이 세션 행을 지우고 쿠키도 지운다 — 그래서 **바로 다음 요청은 410 이
    // 아니라 평범한 401** 이다. 두 요청 모두 410 을 주는 mock 은 재확인(verifySession 의 새
    // me() 호출)이 우연히 같은 410 을 다시 만나 버그를 가린다(리뷰 재확인, 2026-09-21) — 그래서
    // 여기서는 1번째만 410, 2번째부터는 401 로 실제 순서를 흉내낸다.
    let calls = 0;
    global.fetch = vi.fn(async () => {
      calls += 1;
      if (calls === 1) {
        return new Response(JSON.stringify({ error: 'account-deleted' }), {
          status: 410,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response(null, { status: 401 }); // 세션 행·쿠키가 이미 지워진 뒤의 평범한 401
    });
    setSyncTransport(createHttpSyncTransport());
    const { rt, state } = fakeRuntime();

    expect(await performLogoutOthers(rt)).toBe('signed-out');
    expect(state.accountDeletedNotice).toBe(true); // 계정 삭제 안내가 떠야 한다
    expect(state.loginNotice).not.toBe('signed-out'); // "로그인이 풀렸어요" 로그인 화면으로 덮이면 안 된다
  });

  it('그 밖의 서버 오류면 error — 게이트는 건드리지 않는다', async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 500 }));
    setSyncTransport(createHttpSyncTransport());
    const { rt, state } = fakeRuntime();

    expect(await performLogoutOthers(rt)).toBe('error');
    expect(state.phase).toBeUndefined();
  });
});

describe('auth-actions: 로컬 삭제 다섯 경로가 전부 프로필 미러를 함께 지운다(profile.md R13·R14)', () => {
  const AVATAR = 'data:image/webp;base64,AAAA';

  function seedMirror(): void {
    window.localStorage.setItem(
      PROFILE_MIRROR_KEY,
      JSON.stringify({ name: '밀리', avatar: AVATAR }),
    );
    useProfileStore.setState({ name: '밀리', avatar: AVATAR, status: 'ready', hydrated: true });
  }

  function expectMirrorGone(): void {
    expect(window.localStorage.getItem(PROFILE_MIRROR_KEY)).toBeNull();
    expect(useProfileStore.getState()).toMatchObject({
      name: undefined,
      avatar: undefined,
      status: 'idle',
    });
  }

  beforeEach(async () => {
    await getRepositories().sync.wipeLocal();
    await getRepositories().sync.setState({
      deviceId: 'device-1',
      userSub: 'sub-1',
      userEmail: 'a@example.com',
      cursor: 0,
    });
    setSyncTransport(
      createMemorySyncTransport(createMemorySyncServer(), {
        sub: 'sub-1',
        email: 'a@example.com',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
    );
    seedMirror();
  });

  it('첫 로그인 "내보내고 지우기"(resolveUploadChoice export-wipe)', async () => {
    const { rt } = fakeRuntime();
    expect(await resolveUploadChoice(rt, 'export-wipe', async () => true)).toBe(true);
    expectMirrorGone();
  });

  it('로그아웃(performLogout)', async () => {
    const { rt } = fakeRuntime();
    expect(await performLogout(rt, async () => true)).toBe(true);
    expectMirrorGone();
  });

  it('계정 삭제(performDeleteAccount)', async () => {
    const { rt } = fakeRuntime();
    expect(await performDeleteAccount(rt, async () => true)).toBe(true);
    expectMirrorGone();
  });

  it('계정 전환(confirmAccountSwitch)', async () => {
    setSyncTransport(
      createMemorySyncTransport(createMemorySyncServer(), {
        sub: 'sub-new',
        email: 'new@example.com',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
    );
    const { rt } = fakeRuntime();
    expect(await confirmAccountSwitch(rt, async () => true)).toBe(true);
    expectMirrorGone();
  });

  it('계정 삭제 안내(acknowledgeAccountDeleted)', async () => {
    const { rt } = fakeRuntime();
    expect(await acknowledgeAccountDeleted(rt, async () => true)).toBe(true);
    expectMirrorGone();
  });

  it('내보내기가 취소되면 미러도 그대로다(지우지 않는 경로는 미러도 지우지 않는다)', async () => {
    const { rt } = fakeRuntime();
    expect(await performLogout(rt, async () => false)).toBe(false);
    expect(window.localStorage.getItem(PROFILE_MIRROR_KEY)).not.toBeNull();
  });

  it('src/features/** 전체에서 직접 `wipeLocal()` 호출이 헬퍼 안 한 곳뿐이다(R14 — 삭제 지점은 하나)', () => {
    // 한 파일만 보면 다른 feature 가 저장소를 직접 지워 미러를 남겨도 초록이다(리뷰 A-m4) — feature 전체를 훑는다.
    const hits: string[] = [];
    const stack = [path.resolve('src/features')];
    while (stack.length > 0) {
      const dir = stack.pop()!;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
          const count = (readFileSync(full, 'utf-8').match(/\.wipeLocal\(\)/g) ?? []).length;
          if (count > 0) hits.push(`${path.relative(process.cwd(), full)}:${count}`);
        }
      }
    }
    expect(hits).toEqual(['src/features/sync/store/auth-actions.ts:1']);
    const source = readFileSync(path.resolve('src/features/sync/store/auth-actions.ts'), 'utf-8');
    expect(source).toMatch(
      /async function wipeLocalAndMirrors\(rt: SyncRuntime\)[\s\S]*?\.wipeLocal\(\)/,
    );
    // 여섯 호출(다섯 경로 — 계정 전환은 두 갈래)이 전부 헬퍼를 탄다.
    expect(source.match(/await wipeLocalAndMirrors\(rt\)/g)).toHaveLength(6);
  });
});
