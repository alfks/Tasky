import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ToastViewport } from '@/components/ui/Toast';
import type { ToastItem } from '@/components/ui/Toast';

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

const undoToast: ToastItem = {
  id: 'undo',
  message: '삭제했어요',
  action: { label: '되돌리기', onAction },
};

function renderToasts(toasts: readonly ToastItem[]) {
  return render(<ToastViewport toasts={toasts} onClose={onClose} />);
}

describe('ToastViewport', () => {
  it('액션이 있으면 6초, 없으면 3초 뒤에 id 와 함께 닫힌다', () => {
    const { unmount } = renderToasts([undoToast]);
    advance(5999);
    expect(onClose).not.toHaveBeenCalled();
    advance(1);
    expect(onClose).toHaveBeenCalledWith('undo');
    unmount();

    onClose.mockClear();
    renderToasts([{ id: 'saved', message: '저장했어요' }]);
    advance(2999);
    expect(onClose).not.toHaveBeenCalled();
    advance(1);
    expect(onClose).toHaveBeenCalledWith('saved');
  });

  // 라이브 영역은 내용보다 먼저 존재해야 변경을 감지한다(리뷰 M-4). 토스트가 들어와도 영역 노드는
  // 같은 노드로 남아 있어야 한다 — 영역과 문구가 같이 생기면 상당수 조합이 낭독하지 않는다.
  it('토스트가 없어도 라이브 영역이 상주하고, 토스트는 그 안으로 들어온다', () => {
    const { rerender } = renderToasts([]);
    const polite = screen.getByRole('status');
    const assertive = screen.getByRole('alert');
    expect(polite).toBeEmptyDOMElement();
    expect(polite).toHaveAttribute('aria-live', 'polite');
    expect(assertive).toHaveAttribute('aria-live', 'assertive');

    rerender(<ToastViewport toasts={[undoToast]} onClose={onClose} />);
    expect(screen.getByRole('status')).toBe(polite);
    expect(polite).toHaveTextContent('삭제했어요');
  });

  it('에러 토스트는 assertive 영역으로 간다', () => {
    renderToasts([{ id: 'err', message: '저장하지 못했어요', variant: 'error' }]);

    expect(screen.getByRole('alert')).toHaveTextContent('저장하지 못했어요');
    expect(screen.getByRole('status')).toBeEmptyDOMElement();
  });

  // 예전 구조는 토스트마다 전폭 fixed 컨테이너를 그려 둘이 뜨면 정확히 겹쳤다(todo R10 + R13).
  it('두 개가 동시에 떠도 한 줄기에 세로로 쌓인다', () => {
    renderToasts([undoToast, { id: 'moved', message: "'내일'로 옮겼어요" }]);

    const polite = screen.getByRole('status');
    expect(polite.children).toHaveLength(2);
    expect(polite.className).toContain('flex-col');
  });

  it('포인터가 올라가 있는 동안 타이머가 멈추고 벗어나면 남은 시간부터 이어 간다', () => {
    renderToasts([undoToast]);
    const toast = screen.getByText('삭제했어요').parentElement as HTMLElement;

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
    renderToasts([undoToast]);
    const action = screen.getByRole('button', { name: '되돌리기' });

    act(() => action.focus());
    advance(60000);
    expect(onClose).not.toHaveBeenCalled();

    act(() => action.blur());
    advance(6000);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('액션 버튼을 누르면 액션이 실행된다', () => {
    renderToasts([undoToast]);
    fireEvent.click(screen.getByRole('button', { name: '되돌리기' }));
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it('body 로 포털된다(transform 조상 안에서도 화면 아래 고정)', () => {
    const { container } = render(
      <div style={{ transform: 'translate(120px, 200px)' }}>
        <ToastViewport toasts={[undoToast]} onClose={onClose} />
      </div>,
    );

    expect(container.contains(screen.getByRole('status'))).toBe(false);
  });
});
