import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DragHandle } from '@/components/ui/DragHandle';

const noop = (): void => {};

describe('DragHandle', () => {
  it('대상 이름에 조작 안내를 붙여 접근 이름을 만든다', () => {
    render(<DragHandle item="공부" onDragStart={noop} onDragEnd={noop} onMove={noop} />);

    expect(screen.getByRole('button', { name: '공부 순서 변경 (Alt+위/아래)' })).toHaveAttribute(
      'draggable',
      'true',
    );
  });

  it('`Alt+↑/↓` 만 움직인다 — `Alt` 없는 방향키는 지나간다', async () => {
    const user = userEvent.setup();
    const onMove = vi.fn();
    render(<DragHandle item="공부" onDragStart={noop} onDragEnd={noop} onMove={onMove} />);

    screen.getByRole('button').focus();
    await user.keyboard('{ArrowUp}');
    expect(onMove).not.toHaveBeenCalled();

    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(onMove.mock.calls).toEqual([[-1], [1]]);
  });
});
