import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Toast } from '@/components/ui/Toast';

const onClose = vi.fn();
const onAction = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  onClose.mockClear();
  onAction.mockClear();
});

afterEach(() => {
  vi.useRealTimers();
});

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('Toast', () => {
  it('액션이 있으면 6초, 없으면 3초 뒤에 닫힌다', () => {
    const { unmount } = render(
      <Toast message="삭제했어요" action={{ label: '되돌리기', onAction }} onClose={onClose} />,
    );
    advance(5999);
    expect(onClose).not.toHaveBeenCalled();
    advance(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    unmount();

    onClose.mockClear();
    render(<Toast message="저장했어요" onClose={onClose} />);
    advance(2999);
    expect(onClose).not.toHaveBeenCalled();
    advance(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('스크린 리더에 알리는 역할을 갖는다(에러는 alert)', () => {
    const { unmount } = render(<Toast message="삭제했어요" onClose={onClose} />);
    expect(screen.getByRole('status')).toHaveTextContent('삭제했어요');
    unmount();

    render(<Toast message="저장하지 못했어요" variant="error" onClose={onClose} />);
    expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요');
  });

  it('포인터가 올라가 있는 동안 타이머가 멈추고 벗어나면 남은 시간부터 이어 간다', () => {
    render(
      <Toast message="삭제했어요" action={{ label: '되돌리기', onAction }} onClose={onClose} />,
    );
    const toast = screen.getByRole('status');

    advance(3000);
    fireEvent.mouseEnter(toast);
    advance(60000);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseLeave(toast);
    advance(2999);
    expect(onClose).not.toHaveBeenCalled();
    advance(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('액션 버튼에 포커스가 있는 동안에도 타이머가 멈춘다', () => {
    render(
      <Toast message="삭제했어요" action={{ label: '되돌리기', onAction }} onClose={onClose} />,
    );
    const action = screen.getByRole('button', { name: '되돌리기' });

    act(() => action.focus());
    advance(60000);
    expect(onClose).not.toHaveBeenCalled();

    act(() => action.blur());
    advance(6000);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('액션 버튼을 누르면 액션이 실행된다', () => {
    render(
      <Toast message="삭제했어요" action={{ label: '되돌리기', onAction }} onClose={onClose} />,
    );
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });
});
