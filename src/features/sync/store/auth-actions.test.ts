import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createCategory } from '@/domain/category/category.rules';
import type { SyncState } from '@/domain/sync/wire';

import { getRepositories, setSyncTransport } from '@/repositories/container';
import { createMemorySyncServer } from '@/repositories/memory/sync-server';
import { createMemorySyncTransport } from '@/repositories/memory/sync-transport';

import { createHttpSyncTransport } from '@/infra/sync/http-transport';

import {
  acknowledgeAccountDeleted,
  confirmAccountSwitch,
  deferUpload,
  performDeleteAccount,
  performLogout,
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
    const ok = await performLogout(rt, async () => false);
    expect(ok).toBe(false);
    expect(state.phase).toBeUndefined();
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
