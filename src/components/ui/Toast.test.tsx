import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { Dialog } from '@/components/ui/Dialog';
import {
  MAX_VISIBLE_TOASTS,
  TOAST_DISMISS_LABEL,
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
  it('액션 유무에 관계없이 3초 뒤에 id 와 함께 닫힌다', () => {
    const { unmount } = renderToasts([undoToast]);
    advance(2999);
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

    advance(1000);
    fireEvent.mouseEnter(toast);
    advance(60000);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseLeave(toast);
    advance(1999);
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
    advance(3000);
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

const DAY_MS = 86_400_000;
describe('✕ 닫기 버튼', () => {
  beforeEach(() => clearToasts());
  it('onDismiss 는(pwa dismissUpdate 경로) ✕ 로 닫을 때만 불린다', () => {
    const onDismiss = vi.fn();
    const toast = { id: 'x', message: '알림', onDismiss };
    const { unmount } = renderToasts([toast]);
    advance(3000); // 자동 닫힘
    expect(onClose).toHaveBeenCalledWith('x');
    expect(onDismiss).not.toHaveBeenCalled();
    unmount();
    renderToasts([toast]);
    fireEvent.click(screen.getByRole('button', { name: TOAST_DISMISS_LABEL }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });
  it('허브 토스트를 ✕ 로 닫으면 목록에서 빠진다 — 눌러서 실제로 사라지는가', () => {
    const Subscriber = () => <ToastViewport toasts={useToasts()} onClose={dismissToast} />;
    render(<Subscriber />);
    act(() => void pushToast({ message: '새 버전이 준비됐어요', durationMs: null }));
    fireEvent.click(screen.getByRole('button', { name: TOAST_DISMISS_LABEL }));
    expect(getToasts()).toEqual([]);
    expect(screen.queryByText('새 버전이 준비됐어요')).not.toBeInTheDocument();
  });
  it('[되돌리기] 다음에 닿고, 닫으면 포커스가 들어온 자리로 돌아간다', async () => {
    // Tab 은 실제 포커스 이동이라 가짜 타이머 위에서 userEvent 가 멈춘다 — 여기서만 실시간이다.
    vi.useRealTimers();
    const user = userEvent.setup();
    const Harness = () => (
      <>
        <button type="button">바깥</button>
        <ToastViewport toasts={useToasts()} onClose={dismissToast} />
      </>
    );
    render(<Harness />);
    act(() => void pushToast({ message: '삭제했어요', action: { label: '되돌리기', onAction } }));
    const outside = screen.getByRole('button', { name: '바깥' });
    await user.tab();
    expect(outside).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: '되돌리기' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: TOAST_DISMISS_LABEL })).toHaveFocus();
    // 되돌려주지 않으면 포커스가 <body> 로 떨어져 문서 처음부터 다시 Tab 해야 한다(실측).
    await user.keyboard('{Enter}');
    expect(getToasts()).toEqual([]);
    expect(outside).toHaveFocus();
  });
  it('✕ 에 포커스가 있는 동안에도 타이머가 멈춘다', () => {
    renderToasts([undoToast]);
    const dismiss = screen.getByRole('button', { name: TOAST_DISMISS_LABEL });
    act(() => dismiss.focus());
    advance(60_000);
    expect(onClose).not.toHaveBeenCalled();
    act(() => dismiss.blur());
    advance(3000);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('모달이 떠 있어도 ✕ 가 inert 아래로 들어가지 않고 눌린다', () => {
    render(
      <>
        <Dialog open onClose={vi.fn()} title="장보기를 삭제할까요?" />
        <ToastViewport toasts={[undoToast]} onClose={onClose} />
      </>,
    );
    const dismiss = screen.getByRole('button', { name: TOAST_DISMISS_LABEL });
    expect(dismiss.closest('[inert]')).toBeNull();
    act(() => dismiss.focus());
    expect(dismiss).toHaveFocus(); // inert 아래였다면 .focus() 가 무시된다
    fireEvent.click(dismiss);
    expect(onClose).toHaveBeenCalledWith('undo');
  });
});
// "유지" 는 큰 수가 아니라 타이머를 **걸지 않는 것**이다(원인: `Toast.tsx` 의 `TIMER_MAX_MS` 주석).
describe('자동 닫힘 끄기 (durationMs)', () => {
  it.each([
    ['null — 명시적인 유지', null],
    ['Infinity (예전엔 즉시 닫혔다)', Number.POSITIVE_INFINITY],
    ['2^31-1 우회 (예전엔 24.8일 뒤 닫혔다)', 2_147_483_647],
    ['2^31 (32비트를 넘겨 1ms 로 접히던 값)', 2_147_483_648],
  ])('%s: 30일이 흘러도 닫히지 않는다', (_label, durationMs) => {
    renderToasts([{ id: 'keep', message: '새 버전이 준비됐어요', durationMs }]);
    advance(1);
    expect(onClose).not.toHaveBeenCalled();
    advance(30 * DAY_MS);
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: TOAST_DISMISS_LABEL }));
    expect(onClose).toHaveBeenCalledWith('keep');
  });
  it('유한한 값은 그대로 지킨다 — 전부 유지로 접지 않는다', () => {
    renderToasts([{ id: 'short', message: '저장했어요', durationMs: 1200 }]);
    advance(1199);
    expect(onClose).not.toHaveBeenCalled();
    advance(1);
    expect(onClose).toHaveBeenCalledWith('short');
  });
});
