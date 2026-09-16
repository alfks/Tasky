import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  MAX_VISIBLE_TOASTS,
  ToastViewport,
  clearToasts,
  dismissToast,
  getToasts,
  pushToast,
  useToasts,
} from '@/components/ui/Toast';
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

/*
 * 이 한 줄은 CSS 라 jsdom 이 값을 계산하지 못한다 — 그래서 **문자열 계약**으로 고정한다.
 * 짝은 `features/shell/lib/toast-stack.ts` 의 `publishBottomReserve` 이고, 그쪽은 값을 올리는지
 * 따로 잰다. 둘 중 하나만 바뀌면 400px 에서 토스트가 `[+ 할 일]` 막대를 다시 덮는다(실측: 리뷰
 * 라운드 1, 토스트 721~768 vs 라벨 744~780). 실제 좌표 확인은 실 Chromium 으로 한다(PR 본문).
 */
describe('하단 고정 막대 비켜 가기', () => {
  it('뷰포트의 bottom 이 --toast-bottom-reserve 를 더한다', () => {
    renderToasts([undoToast]);
    const root = document.querySelector('[data-overlay-always-live]');
    expect(root?.className).toContain('var(--toast-bottom-reserve,0px)');
  });
});

describe('토스트 허브 (app-shell R8 "동시에 1개")', () => {
  beforeEach(() => {
    clearToasts();
  });

  it('밀어 넣은 순서대로 id 를 새로 주고, 같은 문구여도 id 가 다르다', () => {
    const first = pushToast({ message: '같은 문구' });
    const second = pushToast({ message: '같은 문구' });
    expect(first).not.toBe(second);
    expect(getToasts()).toEqual([{ id: second, message: '같은 문구' }]);
  });

  it('화면에 남는 수는 MAX_VISIBLE_TOASTS 다 — 새것이 오면 오래된 것이 밀려난다', () => {
    pushToast({ message: '첫째' });
    pushToast({ message: '둘째' });
    expect(getToasts()).toHaveLength(MAX_VISIBLE_TOASTS);
    expect(getToasts().at(-1)?.message).toBe('둘째');
  });

  it('액션을 그대로 들고 간다 — [되돌리기] 가 뷰포트까지 전달돼야 한다', () => {
    pushToast({ message: '삭제했어요', action: { label: '되돌리기', onAction } });
    expect(getToasts()[0]?.action?.onAction).toBe(onAction);
  });

  it('id 로 닫는다. 없는 id 는 아무 일도 하지 않는다(구독자를 흔들지 않는다)', () => {
    const id = pushToast({ message: '하나' });
    const before = getToasts();
    dismissToast('없는-id');
    expect(getToasts()).toBe(before);
    dismissToast(id);
    expect(getToasts()).toEqual([]);
  });

  it('구독자는 밀어 넣는 즉시 다시 그린다', () => {
    function Subscriber() {
      return <ToastViewport toasts={useToasts()} onClose={dismissToast} />;
    }
    render(<Subscriber />);
    expect(screen.queryByText('옮겼어요')).not.toBeInTheDocument();
    act(() => {
      pushToast({ message: '옮겼어요' });
    });
    expect(screen.getByText('옮겼어요')).toBeInTheDocument();
    // 자동 닫힘도 허브를 거쳐 돈다(액션 없음 = 3초).
    advance(3000);
    expect(screen.queryByText('옮겼어요')).not.toBeInTheDocument();
    expect(getToasts()).toEqual([]);
  });
});
