import { useRef, useState } from 'react';

import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from '@/components/ui/Dialog';
import { TOAST_DISMISS_LABEL, ToastViewport } from '@/components/ui/Toast';

import type { UserEvent } from '@testing-library/user-event';

/** `onClick` 을 주면 [취소]·[삭제] 가 실제로 닫는 버튼이 된다 — "확정" 닫기 경로가 이걸 쓴다. */
function Footer({ onClick }: { onClick?: () => void }) {
  return (
    <>
      <button type="button" onClick={onClick}>
        취소
      </button>
      <button type="button" onClick={onClick}>
        삭제
      </button>
    </>
  );
}

/** 패널 뒤의 덮개. "바깥 클릭"은 실제로 여기 떨어진다(배경은 `inert` 라 닿지 않는다). */
function backdrop(): HTMLElement {
  const el = screen.getByRole('dialog').parentElement?.firstElementChild;
  if (!(el instanceof HTMLElement)) throw new Error('백드롭을 찾지 못했습니다');
  return el;
}

/** 여는 버튼 → 대화상자. 포커스 복귀·스크롤 잠금처럼 "닫힌 뒤"를 보는 테스트가 쓴다. */
function Harness({ returnFocus }: { returnFocus?: () => HTMLElement | null }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        열기
      </button>
      <button type="button" id="다음-행">
        다음 행
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="장보기를 삭제할까요?"
        description="되돌릴 수 없어요."
        returnFocus={returnFocus}
        footer={<Footer onClick={() => setOpen(false)} />}
      />
    </>
  );
}

/** 확인의 결과로 여는 요소가 사라지는 경우(app-shell R14 의 주 경로). */
function RemovingHarness({ returnFocus }: { returnFocus: () => HTMLElement | null }) {
  const [state, setState] = useState<'closed' | 'open' | 'confirmed'>('closed');
  return (
    <>
      {state === 'confirmed' ? null : (
        <button type="button" onClick={() => setState('open')}>
          열기
        </button>
      )}
      <button type="button" id="다음-행">
        다음 행
      </button>
      <Dialog
        open={state === 'open'}
        onClose={() => setState('confirmed')}
        title="장보기를 삭제할까요?"
        returnFocus={returnFocus}
        footer={<Footer onClick={() => setState('confirmed')} />}
      />
    </>
  );
}

describe('Dialog', () => {
  it('열리면 첫 포커스 가능 요소로, initialFocusRef 가 있으면 그 요소로 포커스가 간다', () => {
    function WithInitialFocus() {
      const ref = useRef<HTMLButtonElement>(null);
      return (
        <Dialog
          open
          onClose={vi.fn()}
          title="제목"
          initialFocusRef={ref}
          footer={
            <>
              <button ref={ref} type="button">
                취소
              </button>
              <button type="button">삭제</button>
            </>
          }
        />
      );
    }

    const { unmount } = render(<Dialog open onClose={vi.fn()} title="제목" footer={<Footer />} />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '닫기' }));
    unmount();

    render(<WithInitialFocus />);
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '취소' }));
  });

  it('aria-modal 과 제목·본문 연결을 갖는다', () => {
    render(<Dialog open onClose={vi.fn()} title="제목" description="본문" footer={<Footer />} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAccessibleName('제목');
    expect(dialog).toHaveAccessibleDescription('본문');
  });

  it('Esc 로 닫히지만 IME 조합 중 Esc 는 닫지 않는다', () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} title="제목" footer={<Footer />} />);
    const dialog = screen.getByRole('dialog');

    fireEvent.keyDown(dialog, { key: 'Escape', keyCode: 229 });
    fireEvent.keyDown(dialog, { key: 'Escape', isComposing: true });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(dialog, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  // app-shell R14 의 Enter 규칙은 단순형과 선택지형 양쪽에 걸린다. 가드가 ConfirmDialog 안에만
  // 있으면 <form> 을 쓰는 기능 전용 대화상자(category R10)가 그대로 관통한다 — 그래서 Dialog 가 막는다.
  // jsdom 은 폼 암묵 제출을 구현하지 않으므로, 브라우저에서 그 제출을 막는 유일한 지점인
  // "keydown 의 기본 동작 취소"를 검사한다(실제 Chromium 관통은 리뷰 §A V11·V12 실측).
  it('폼이 들어와도 Enter 가 암묵 제출로 새지 않는다(조합 중이든 아니든)', () => {
    const onSubmit = vi.fn((e: { preventDefault: () => void }) => e.preventDefault());
    render(
      <Dialog open onClose={vi.fn()} role="alertdialog" title="'공부'를 삭제할까요?">
        <form onSubmit={onSubmit}>
          <input aria-label="새 카테고리 이름" />
          {/* type 을 생략한 버튼은 submit 이다 — 암묵 제출이 이 버튼을 누른다. */}
          <button>확인</button>
        </form>
      </Dialog>,
    );
    const input = screen.getByLabelText('새 카테고리 이름');
    input.focus();

    const composing = createEvent.keyDown(input, { key: 'Enter', isComposing: true });
    fireEvent(input, composing);
    expect(composing.defaultPrevented).toBe(true);

    const byKeyCode = createEvent.keyDown(input, { key: 'Enter', keyCode: 229 });
    fireEvent(input, byKeyCode);
    expect(byKeyCode.defaultPrevented).toBe(true);

    const plain = createEvent.keyDown(input, { key: 'Enter' });
    fireEvent(input, plain);
    expect(plain.defaultPrevented).toBe(true);

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('버튼 위의 Enter 는 그 버튼만 실행한다(기본 동작 유지)', () => {
    render(<Dialog open onClose={vi.fn()} title="제목" footer={<Footer />} />);
    const remove = screen.getByRole('button', { name: '삭제' });
    remove.focus();

    const plain = createEvent.keyDown(remove, { key: 'Enter' });
    fireEvent(remove, plain);
    expect(plain.defaultPrevented).toBe(false);

    const composing = createEvent.keyDown(remove, { key: 'Enter', isComposing: true });
    fireEvent(remove, composing);
    expect(composing.defaultPrevented).toBe(true);
  });

  it('바깥을 누르면 닫히고 패널 안을 누르면 닫히지 않는다', () => {
    const onClose = vi.fn();
    render(<Dialog open onClose={onClose} title="제목" footer={<Footer />} />);

    fireEvent.mouseDown(screen.getByRole('button', { name: '삭제' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('열려 있는 동안 배경 스크롤을 잠그고 닫히면 되돌린다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    expect(document.body.style.overflow).toBe('');

    await user.click(screen.getByRole('button', { name: '열기' }));
    expect(document.body.style.overflow).toBe('hidden');

    await user.keyboard('{Escape}');
    expect(document.body.style.overflow).toBe('');
  });

  // transform 조상 안에서 position:fixed 는 그 조상을 기준으로 해석된다(투두 행의 FLIP 모션, todo R8).
  it('패널을 body 로 포털해 transform 조상 밖에 그린다', () => {
    const { container } = render(
      <div style={{ transform: 'translate(120px, 200px)' }}>
        <Dialog open onClose={vi.fn()} title="제목" footer={<Footer />} />
      </div>,
    );

    const dialog = screen.getByRole('dialog');
    expect(container.contains(dialog)).toBe(false);
    expect(dialog.closest('[style*="transform"]')).toBeNull();
    expect(dialog.parentElement?.parentElement).toBe(document.body);
  });

  it('Esc 는 맨 위 대화상자 하나만 닫는다', async () => {
    const user = userEvent.setup();
    function Nested() {
      const [outer, setOuter] = useState(true);
      const [inner, setInner] = useState(true);
      return (
        <>
          <Dialog open={outer} onClose={() => setOuter(false)} title="바깥" footer={<Footer />} />
          <Dialog open={inner} onClose={() => setInner(false)} title="안쪽" footer={<Footer />} />
        </>
      );
    }
    render(<Nested />);
    expect(screen.getAllByRole('dialog')).toHaveLength(2);

    await user.keyboard('{Escape}');
    const remaining = screen.getAllByRole('dialog');
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toHaveAccessibleName('바깥');

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  // jsdom 은 mousedown 의 **기본 동작**(브라우저가 포커스를 옮기는 부분)을 구현하지 않는다. 그래서
  // 아래 "백드롭 클릭" 경로는 고치기 전에도 jsdom 에서는 초록이었는데 Chromium 에서는 포커스가
  // `<body>` 로 떨어졌다(T-35: 3좌표 × 대화상자 3종 전부 재현). 브라우저에서 그 이동을 막는 지점은
  // "바깥 mousedown 의 기본 동작 취소" 하나뿐이므로, 그 취소 자체를 여기서 검사한다.
  it('바깥 mousedown 의 기본 동작을 막는다 — 패널 안은 그대로 둔다', () => {
    render(<Dialog open onClose={vi.fn()} title="제목" footer={<Footer />} />);

    const outside = createEvent.mouseDown(backdrop());
    fireEvent(backdrop(), outside);
    expect(outside.defaultPrevented).toBe(true);

    const remove = screen.getByRole('button', { name: '삭제' });
    const inside = createEvent.mouseDown(remove);
    fireEvent(remove, inside);
    expect(inside.defaultPrevented).toBe(false);
  });
});

// 닫기 경로 넷은 **같은** 복귀 규칙을 타야 한다 — 그동안 Esc 만 이 수준으로 재고 있었고, 빠져 있던
// 백드롭 클릭에서 포커스가 `<body>` 로 떨어졌다(T-35). 취소로 닫았는데 포커스가 옆 행으로 가면
// 다음 Delete 가 엉뚱한 항목을 지우므로(리뷰 M-3), 경로마다 두 갈래를 같이 잰다.
const CLOSE_PATHS: ReadonlyArray<[string, (user: UserEvent) => Promise<void>]> = [
  ['Esc', (user) => user.keyboard('{Escape}')],
  ['✕ 버튼', (user) => user.click(screen.getByRole('button', { name: '닫기' }))],
  ['백드롭 클릭', (user) => user.click(backdrop())],
  ['확정(액션 실행)', (user) => user.click(screen.getByRole('button', { name: '삭제' }))],
];

describe.each(CLOSE_PATHS)('Dialog — %s 로 닫을 때', (_path, close) => {
  it('여는 요소가 살아 있으면 returnFocus 를 묻지 않고 그리로 돌아간다', async () => {
    const user = userEvent.setup();
    const returnFocus = vi.fn(() => document.getElementById('다음-행'));
    render(<Harness returnFocus={returnFocus} />);
    const opener = screen.getByRole('button', { name: '열기' });

    await user.click(opener);
    await close(user);

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
    expect(returnFocus).not.toHaveBeenCalled();
  });

  it('여는 요소가 사라졌으면 returnFocus 가 준 요소로 간다', async () => {
    const user = userEvent.setup();
    render(<RemovingHarness returnFocus={() => document.getElementById('다음-행')} />);

    await user.click(screen.getByRole('button', { name: '열기' }));
    await close(user);

    expect(screen.queryByRole('button', { name: '열기' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '다음 행' }));
  });
});

// 모달이 떠 있는 동안에도 토스트는 살아 있어야 한다(app-shell §5 · R8) — 그래서 토스트 뷰포트는
// 배경 `inert` 를 비켜 가는 표식(`OVERLAY_ALWAYS_LIVE_ATTR`)을 단다. 그런데 그 표식은 `inert` 만
// 비켜 갔을 뿐 **바깥 클릭 판정**에는 없었다: 토스트는 패널 밖이라 "바깥"으로 읽혀, 모달을 띄운 채
// `[되돌리기]` 를 마우스로 누르면 되돌려지면서 **모달까지 닫혔다**(T-29 실측, T-29 이전부터 있던 결함).
// 키보드(Tab → Enter) 경로는 mousedown 이 없어 무관하다. 여기서는 진짜 `ToastViewport` 를 쓴다 —
// 표식을 붙이는 쪽과 읽는 쪽이 실제로 맞물리는지까지 같이 재기 위해서다.
function WithToast({ onAction }: { onAction: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        열기
      </button>
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="장보기를 삭제할까요?"
        footer={<Footer onClick={() => setOpen(false)} />}
      />
      {/* durationMs: null = 타이머를 걸지 않는다. 자동 닫힘이 판정에 섞이지 않게. */}
      <ToastViewport
        toasts={[
          {
            id: 't1',
            message: "'장보기'를 삭제했어요",
            durationMs: null,
            action: { label: '되돌리기', onAction },
          },
        ]}
        onClose={vi.fn()}
      />
    </>
  );
}

describe('Dialog — 모달 위에 살아 있는 토스트', () => {
  it.each([['되돌리기'], [TOAST_DISMISS_LABEL]])(
    '토스트의 [%s] 를 마우스로 눌러도 모달은 닫히지 않는다',
    async (name) => {
      const user = userEvent.setup();
      const onAction = vi.fn();
      render(<WithToast onAction={onAction} />);

      await user.click(screen.getByRole('button', { name: '열기' }));
      expect(screen.getByRole('dialog')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name }));

      expect(screen.getByRole('dialog')).toBeInTheDocument();
      expect(onAction).toHaveBeenCalledTimes(name === '되돌리기' ? 1 : 0);
    },
  );

  // 반대 방향. 예외를 "문서에 토스트 뷰포트가 떠 있으면 전부 바깥이 아니다" 로 넓게 잡으면 위 두
  // 케이스는 그대로 초록인데 **진짜 바깥 클릭이 영영 안 닫힌다**(음성 대조 B1: 이 케이스가 없을 때
  // 0 죽음으로 살아남았다). 기존 백드롭 테스트들은 토스트를 띄우지 않아 그 변이를 보지 못하므로,
  // "토스트가 떠 있는 동안에도" 백드롭이 닫는다는 것을 여기서 따로 잰다.
  it('토스트가 떠 있어도 백드롭 클릭은 여전히 모달을 닫는다', async () => {
    const user = userEvent.setup();
    render(<WithToast onAction={vi.fn()} />);
    const opener = screen.getByRole('button', { name: '열기' });

    await user.click(opener);
    await user.click(backdrop());

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.activeElement).toBe(opener);
    // 모달만 닫히고 토스트는 살아남는다.
    expect(screen.getByRole('button', { name: '되돌리기' })).toBeInTheDocument();
  });

  // 백드롭은 기본 동작을 막아야 하지만(T-35) 토스트 버튼은 **막으면 안 된다** — 막는 순간 브라우저가
  // 그 버튼에 포커스를 주지 않아, 마우스로 누른 뒤 토스트가 사라지면 포커스가 `<body>` 로 떨어진다.
  it('토스트 위 mousedown 의 기본 동작은 막지 않는다', () => {
    render(<WithToast onAction={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: '열기' }));

    const undo = screen.getByRole('button', { name: '되돌리기' });
    const event = createEvent.mouseDown(undo);
    fireEvent(undo, event);
    expect(event.defaultPrevented).toBe(false);
  });
});
