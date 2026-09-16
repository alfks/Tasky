import { useRef, useState } from 'react';

import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from '@/components/ui/Dialog';
import { Popover } from '@/components/ui/Popover';
import { ToastViewport } from '@/components/ui/Toast';

function Footer() {
  return (
    <>
      <button type="button">취소</button>
      <button type="button">삭제</button>
    </>
  );
}

/** 여는 버튼 → 대화상자. "닫힌 뒤"까지 보는 테스트가 쓴다. */
function Harness() {
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
        footer={<Footer />}
      />
    </>
  );
}

/** 모달 안에서 팝오버를 여는 구조 — 리뷰 F2 가 Tab 트랩이 풀린다고 실측한 조합이다. */
function DialogWithPopover() {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [dialogOpen, setDialogOpen] = useState(true);
  const [popoverOpen, setPopoverOpen] = useState(false);
  return (
    <Dialog
      open={dialogOpen}
      onClose={() => setDialogOpen(false)}
      title="편집"
      footer={
        <button ref={anchorRef} type="button" onClick={() => setPopoverOpen(true)}>
          카테고리
        </button>
      }
    >
      <Popover
        open={popoverOpen}
        onClose={() => setPopoverOpen(false)}
        anchorRef={anchorRef}
        label="카테고리 선택"
      >
        <button type="button">공부</button>
      </Popover>
    </Dialog>
  );
}

describe('Dialog 포커스 트랩 · 배경 inert', () => {
  it('Tab 과 Shift+Tab 이 패널 안에서 순환한다', async () => {
    const user = userEvent.setup();
    render(<Dialog open onClose={vi.fn()} title="제목" footer={<Footer />} />);
    const close = screen.getByRole('button', { name: '닫기' });
    const remove = screen.getByRole('button', { name: '삭제' });

    remove.focus();
    await user.tab();
    expect(document.activeElement).toBe(close);

    await user.tab({ shift: true });
    expect(document.activeElement).toBe(remove);
  });

  // 포털 도입으로 팝오버 패널이 대화상자 패널 밖(body 직계)으로 나갔다. 대화상자가 "위 레이어가
  // 있으니 맡긴다"며 트랩을 끄면 팝오버에는 트랩이 없어 아무도 가두지 않는다 — 실제 Chromium 에서
  // Tab 6회에 BODY → ✕ → … 로 새어 나갔다(리뷰 Major 1). app-shell R14 "body 낙하 없음" 위반.
  it('안에 연 팝오버까지 포함해 Tab 이 오버레이 안에 머문다(body 로 떨어지지 않는다)', async () => {
    const user = userEvent.setup();
    render(<DialogWithPopover />);
    await user.click(screen.getByRole('button', { name: '카테고리' }));

    const panel = screen.getByRole('dialog');
    const popover = screen.getByRole('group', { name: '카테고리 선택' });
    const inOverlay = () => {
      const active = document.activeElement;
      return active !== null && (panel.contains(active) || popover.contains(active));
    };

    expect(inOverlay()).toBe(true);
    let visitedPopover = false;
    for (let i = 0; i < 6; i += 1) {
      await user.tab();
      expect(document.activeElement).not.toBe(document.body);
      expect(inOverlay()).toBe(true);
      if (popover.contains(document.activeElement)) visitedPopover = true;
    }
    // 순환 집합이 "패널 ∪ 위 레이어"라는 증거 — 대화상자 패널 안에서만 돌면 여기가 false 가 된다.
    expect(visitedPopover).toBe(true);
  });

  // 위 레이어가 스스로 가두면(중첩 대화상자) 아래는 물러나야 한다 — 합치면 바깥 패널로 새어 나간다.
  it('위에 또 다른 대화상자가 있으면 Tab 은 위 대화상자 안에서만 돈다', async () => {
    const user = userEvent.setup();
    render(
      <>
        <Dialog open onClose={vi.fn()} title="바깥" footer={<Footer />} />
        <Dialog open onClose={vi.fn()} title="안쪽">
          <button type="button">안쪽 버튼</button>
        </Dialog>
      </>,
    );
    const inner = screen.getByRole('dialog', { name: '안쪽' });

    for (let i = 0; i < 4; i += 1) {
      await user.tab();
      expect(inner.contains(document.activeElement)).toBe(true);
    }
  });

  it('열려 있는 동안 배경을 inert 로 덮고 닫히면 되돌린다', async () => {
    const user = userEvent.setup();
    const { baseElement, container } = render(<Harness />);
    expect(container.hasAttribute('inert')).toBe(false);

    await user.click(screen.getByRole('button', { name: '열기' }));
    expect(container.hasAttribute('inert')).toBe(true);
    // 대화상자 자신이 담긴 포털 컨테이너는 inert 가 아니어야 한다.
    const dialogContainer = screen.getByRole('dialog').parentElement;
    expect(dialogContainer?.hasAttribute('inert')).toBe(false);
    expect(baseElement).toBe(document.body);

    await user.keyboard('{Escape}');
    expect(container.hasAttribute('inert')).toBe(false);
  });

  // 경계 ①: 중첩. 안쪽이 닫혀도 바깥이 걸어 둔 inert 를 벗기면 안 된다(자기가 건 것만 되돌린다).
  it('중첩 대화상자에서 안쪽을 닫아도 바깥이 건 배경 inert 는 남는다', async () => {
    const user = userEvent.setup();
    function Nested() {
      const [inner, setInner] = useState(true);
      return (
        <>
          <Dialog open onClose={vi.fn()} title="바깥" footer={<Footer />} />
          <Dialog open={inner} onClose={() => setInner(false)} title="안쪽" footer={<Footer />} />
        </>
      );
    }
    const { container } = render(<Nested />);
    const outerPanel = screen.getByRole('dialog', { name: '바깥' }).parentElement;
    expect(outerPanel?.hasAttribute('inert')).toBe(true);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '안쪽' })).not.toBeInTheDocument();
    expect(outerPanel?.hasAttribute('inert')).toBe(false);
    // 바깥 대화상자는 아직 열려 있으므로 앱 루트는 여전히 덮여 있다.
    expect(container.hasAttribute('inert')).toBe(true);
  });

  // 경계 ②: 토스트. 모달 중에도 낭독되고 [되돌리기] 에 포커스가 가야 한다(app-shell §5·R8).
  // 카테고리 삭제 되돌리기(category R15)가 정확히 이 경로다 — 여기서 막히면 기능이 성립하지 않는다.
  it.each([
    ['대화상자보다 먼저 마운트된 토스트', true],
    ['대화상자가 열린 뒤 마운트된 토스트', false],
  ])('%s 는 배경 inert 를 비켜 간다', async (_name, mountedFirst) => {
    const user = userEvent.setup();
    function WithToast() {
      const [open, setOpen] = useState(false);
      const [toast, setToast] = useState(mountedFirst);
      return (
        <>
          <button type="button" onClick={() => setOpen(true)}>
            열기
          </button>
          <button type="button" onClick={() => setToast(true)}>
            토스트
          </button>
          <Dialog open={open} onClose={() => setOpen(false)} title="제목" footer={<Footer />} />
          {toast ? (
            <ToastViewport
              toasts={[
                {
                  id: 't1',
                  message: '삭제했어요',
                  action: { label: '되돌리기', onAction: vi.fn() },
                },
              ]}
              onClose={vi.fn()}
            />
          ) : null}
        </>
      );
    }
    render(<WithToast />);
    await user.click(screen.getByRole('button', { name: '열기' }));
    if (!mountedFirst) await user.click(screen.getByRole('button', { name: '토스트' }));

    const undo = screen.getByRole('button', { name: '되돌리기' });
    // AX 트리에 살아 있는가: 라이브 영역과 버튼 어느 조상도 inert 가 아니다.
    expect(screen.getByText('삭제했어요').closest('[inert]')).toBeNull();
    expect(undo.closest('[inert]')).toBeNull();
    // 포커스가 실제로 가는가 — inert 아래였다면 .focus() 가 무시된다.
    // (포커스는 토스트의 자동 닫힘 타이머를 멈추는 상태 갱신을 일으킨다 — act 로 감싼다.)
    act(() => undo.focus());
    expect(document.activeElement).toBe(undo);
  });

  it('안에 연 팝오버는 Esc 로 자기만 닫히고 대화상자는 남는다', async () => {
    const user = userEvent.setup();
    render(<DialogWithPopover />);

    await user.click(screen.getByRole('button', { name: '카테고리' }));
    expect(screen.getByRole('group', { name: '카테고리 선택' })).toBeInTheDocument();

    // 포털로 나간 팝오버 안쪽 클릭을 대화상자가 "바깥 클릭"으로 오해하지 않는다.
    fireEvent.mouseDown(screen.getByRole('button', { name: '공부' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('group', { name: '카테고리 선택' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
