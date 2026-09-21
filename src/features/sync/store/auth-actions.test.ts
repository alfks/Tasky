import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCategory } from '@/domain/category/category.rules';

import { getRepositories, setSyncTransport } from '@/repositories/container';
import { createMemorySyncServer } from '@/repositories/memory/sync-server';
import { createMemorySyncTransport } from '@/repositories/memory/sync-transport';

import {
  performDeleteAccount,
  performLogout,
  probeSession,
  resolveUploadChoice,
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

  it('sub 가 다르면 switched — exportBackup 성공 시 로컬을 지우고 새 표식으로 cursor 0 을 연다', async () => {
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
    const { rt, setExportBackup } = fakeRuntime();
    setExportBackup(async () => true);
    expect(await verifySession(rt)).toBe('switched');
    const categories = await getRepositories().categories.list({ includeClosed: true });
    expect(categories).toHaveLength(0); // wipeLocal 이 실제로 지웠다(돌연변이 7 대상)
    const after = await getRepositories().sync.getState();
    expect(after).toMatchObject({ deviceId: 'device-1', userSub: 'sub-new', cursor: 0 });
  });

  it('sub 가 다르면 switched — exportBackup 이 등록 안 됐으면 전환을 미룬다(offline 리턴)', async () => {
    await getRepositories().sync.setState({
      deviceId: 'device-1',
      userSub: 'sub-old',
      userEmail: 'old@example.com',
      cursor: 0,
    });
    setSyncTransport(
      createMemorySyncTransport(createMemorySyncServer(), {
        sub: 'sub-new',
        email: 'new@example.com',
        expiresAt: '2099-01-01T00:00:00.000Z',
      }),
    );
    const { rt } = fakeRuntime();
    expect(await verifySession(rt)).toBe('offline');
    const after = await getRepositories().sync.getState();
    expect(after?.userSub).toBe('sub-old'); // 미뤘으니 그대로
  });
});

describe('auth-actions: resolveUploadChoice(R7)', () => {
  it('export-wipe 가 exportBackup 실패면 wipeLocal 을 부르지 않는다', async () => {
    const { rt } = fakeRuntime();
    const exportBackup = vi.fn(async () => false);
    const ok = await resolveUploadChoice(rt, 'export-wipe', exportBackup);
    expect(ok).toBe(false);
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
