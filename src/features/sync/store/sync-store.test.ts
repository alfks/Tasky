import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getRepositories } from '@/repositories/container';

import {
  registerExportBackup,
  resetSyncStoreForTest,
  useSyncStore,
} from '@/features/sync/store/sync-store';

describe('sync-store: bootstrap — 표식 판정(R1)', () => {
  beforeEach(() => {
    resetSyncStoreForTest();
  });

  it('표식이 없으면 phase 가 login 이다', async () => {
    await useSyncStore.getState().bootstrap();
    expect(useSyncStore.getState().phase).toBe('login');
  });

  it('표식이 있으면 phase 가 즉시 ready 다 — 오프라인이어도 통과한다(R6)', async () => {
    await getRepositories().sync.setState({
      deviceId: 'device-1',
      userSub: 'sub-1',
      userEmail: 'a@example.com',
      cursor: 0,
    });
    useSyncStore.setState({ online: false });
    await useSyncStore.getState().bootstrap();
    expect(useSyncStore.getState().phase).toBe('ready');
    expect(useSyncStore.getState().email).toBe('a@example.com');
  });

  it('bootstrap 은 멱등이다 — 두 번 불러도 표식 조회는 한 번만 반영된다', async () => {
    const spy = vi.spyOn(getRepositories().sync, 'getState');
    await useSyncStore.getState().bootstrap();
    await useSyncStore.getState().bootstrap();
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe('sync-store: 업로드 다이얼로그 보류(R7 Esc/✕)', () => {
  beforeEach(() => {
    resetSyncStoreForTest();
  });

  it('deferUpload 은 uploadPrompt 만 끄고 아무것도 지우지 않는다', async () => {
    useSyncStore.setState({ uploadPrompt: true });
    useSyncStore.getState().deferUpload();
    expect(useSyncStore.getState().uploadPrompt).toBe(false);
  });

  // 리뷰 Major 4 — "보류" 는 "결정 안 했다" 지 "결정했다(동기화됨)" 가 아니다. `uploadPending`
  // 은 다이얼로그가 닫혀도 그대로 남아, 계정 블록이 "● 동기화됨" 을 참칭하지 않게 한다.
  it('deferUpload 은 uploadPending 은 그대로 남긴다', async () => {
    useSyncStore.setState({ uploadPrompt: true, uploadPending: true });
    useSyncStore.getState().deferUpload();
    expect(useSyncStore.getState().uploadPrompt).toBe(false);
    expect(useSyncStore.getState().uploadPending).toBe(true);
  });
});

describe('sync-store: exportBackup 등록', () => {
  beforeEach(() => {
    resetSyncStoreForTest();
  });

  it('등록 전에는 null, 등록 후에는 그 함수를 돌려준다', async () => {
    const fn = vi.fn(async () => true);
    registerExportBackup(fn);
    // 등록된 값은 runtime()을 통해서만 노출된다 — resolveUpload 를 거쳐 간접 확인한다.
    const result = await useSyncStore.getState().resolveUpload('export-wipe', fn);
    expect(result).toBe(true);
    registerExportBackup(null);
  });
});
