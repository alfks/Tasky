import { useRef, useState } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Dialog } from '@/components/ui/Dialog';

function Footer() {
  return (
    <>
      <button type="button">취소</button>
      <button type="button">삭제</button>
    </>
  );
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
        footer={<Footer />}
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

  it('닫히면 열었던 요소로, returnFocus 가 있으면 그 요소로 포커스가 돌아간다', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<Harness />);
    const opener = screen.getByRole('button', { name: '열기' });

    await user.click(opener);
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(opener);
    unmount();

    render(<Harness returnFocus={() => document.getElementById('다음-행')} />);
    await user.click(screen.getByRole('button', { name: '열기' }));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '다음 행' }));
  });
});
