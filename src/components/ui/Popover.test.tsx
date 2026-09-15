import { useRef, useState } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Popover } from '@/components/ui/Popover';

function Harness({ onClose }: { onClose?: () => void }) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => {
    setOpen(false);
    onClose?.();
  };
  return (
    <>
      <button ref={anchorRef} type="button" aria-expanded={open} onClick={() => setOpen(true)}>
        설정
      </button>
      <Popover open={open} onClose={close} anchorRef={anchorRef} label="설정">
        <button type="button">다크 모드</button>
      </Popover>
    </>
  );
}

describe('Popover', () => {
  it('열리면 내용이 보이고 첫 포커스 가능 요소로 포커스가 간다', async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole('button', { name: '설정' }));
    expect(screen.getByRole('group', { name: '설정' })).toBeInTheDocument();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: '다크 모드' }));
  });

  it('Esc 로 닫고 앵커로 포커스를 돌려주지만 IME 조합 중 Esc 는 무시한다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);
    const anchor = screen.getByRole('button', { name: '설정' });

    await user.click(anchor);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape', keyCode: 229 });
    expect(onClose).not.toHaveBeenCalled();

    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group', { name: '설정' })).not.toBeInTheDocument();
    expect(document.activeElement).toBe(anchor);
  });

  it('바깥을 누르면 닫히고 안쪽을 누르면 열려 있다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<Harness onClose={onClose} />);

    await user.click(screen.getByRole('button', { name: '설정' }));
    fireEvent.mouseDown(screen.getByRole('button', { name: '다크 모드' }));
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('앵커 위치를 기준으로 좌표가 계산된다', async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const anchor = screen.getByRole('button', { name: '설정' });
    anchor.getBoundingClientRect = () =>
      ({ top: 100, bottom: 140, left: 60, right: 160 }) as DOMRect;

    await user.click(anchor);
    const panel = screen.getByRole('group', { name: '설정' });
    expect(panel).toHaveStyle({ top: '148px', left: '60px' });
  });
});
