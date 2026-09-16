// 전역 토스트 허브 (app-shell.md R8).
import { beforeEach, describe, expect, it } from 'vitest';

import { MAX_VISIBLE_TOASTS, useShellToastStore } from '@/features/shell/store/shell-toast-store';

beforeEach(() => {
  useShellToastStore.setState({ toasts: [] });
});

describe('useShellToastStore', () => {
  it('밀어 넣으면 뜨고 id 를 돌려준다', () => {
    const id = useShellToastStore.getState().pushToast({ message: '저장했어요' });
    expect(useShellToastStore.getState().toasts).toEqual([{ id, message: '저장했어요' }]);
  });

  it('id 는 매번 다르다 — 같은 문구를 두 번 띄워도 목록 키가 겹치지 않는다', () => {
    const first = useShellToastStore.getState().pushToast({ message: '같은 문구' });
    const second = useShellToastStore.getState().pushToast({ message: '같은 문구' });
    expect(first).not.toBe(second);
  });

  it('동시에 남는 수는 R8 대로 하나다 — 새것이 오면 오래된 것이 밀려난다', () => {
    useShellToastStore.getState().pushToast({ message: '첫째' });
    useShellToastStore.getState().pushToast({ message: '둘째' });
    expect(useShellToastStore.getState().toasts).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(useShellToastStore.getState().toasts.at(-1)?.message).toBe('둘째');
  });

  it('닫으면 그 id 만 사라진다', () => {
    const id = useShellToastStore.getState().pushToast({ message: '하나' });
    useShellToastStore.getState().dismissToast(id);
    expect(useShellToastStore.getState().toasts).toEqual([]);
  });

  it('액션을 그대로 들고 간다 — [되돌리기] 가 뷰포트까지 전달돼야 한다', () => {
    const onAction = (): void => {};
    useShellToastStore
      .getState()
      .pushToast({ message: '삭제했어요', action: { label: '되돌리기', onAction } });
    expect(useShellToastStore.getState().toasts[0]?.action?.onAction).toBe(onAction);
  });
});
