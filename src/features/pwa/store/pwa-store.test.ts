import { beforeEach, describe, expect, it } from 'vitest';

import {
  createPwaStore,
  selectIsStorageNoticeOpen,
  selectIsStorageTight,
  selectIsUpdateReady,
} from '@/features/pwa/store/pwa-store';

let store: ReturnType<typeof createPwaStore>;

beforeEach(() => {
  store = createPwaStore();
});

describe('업데이트 알림', () => {
  it('새 버전이 없으면 뜨지 않는다', () => {
    expect(selectIsUpdateReady(store.getState())).toBe(false);
  });

  it('대기 중이면 뜨고, ✕ 로 닫으면 사라진다', () => {
    store.getState().setUpdateStage('waiting');
    expect(selectIsUpdateReady(store.getState())).toBe(true);
    store.getState().dismissUpdate();
    expect(selectIsUpdateReady(store.getState())).toBe(false);
  });

  it('닫은 뒤 다른 탭이 적용하면 다시 뜬다 — 같은 알림이 아니라 새 상황이다', () => {
    store.getState().setUpdateStage('waiting');
    store.getState().dismissUpdate();
    store.getState().setUpdateStage('activated');
    expect(selectIsUpdateReady(store.getState())).toBe(true);
  });
});

describe('저장 공간 배너', () => {
  it('거부됐을 때만 뜨고, 닫으면 다시 뜨지 않는다', () => {
    expect(selectIsStorageNoticeOpen(store.getState())).toBe(false);
    store.getState().setPersistState('granted');
    expect(selectIsStorageNoticeOpen(store.getState())).toBe(false);
    store.getState().setPersistState('denied');
    expect(selectIsStorageNoticeOpen(store.getState())).toBe(true);
    store.getState().dismissStorageNotice();
    expect(selectIsStorageNoticeOpen(store.getState())).toBe(false);
  });

  it('기기별 기억에 닫힘이 남아 있으면 처음부터 뜨지 않는다', () => {
    store.getState().hydrateMemory({ persistAsked: true, noticeDismissed: true });
    store.getState().setPersistState('denied');
    expect(selectIsStorageNoticeOpen(store.getState())).toBe(false);
  });
});

describe('용량 경고', () => {
  it('값을 못 얻었으면 경고하지 않고, 80% 를 넘으면 경고한다', () => {
    expect(selectIsStorageTight(store.getState())).toBe(false);
    store.getState().setEstimate({ usage: 90, quota: 100 });
    expect(selectIsStorageTight(store.getState())).toBe(true);
  });
});
