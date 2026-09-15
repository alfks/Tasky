import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Menu } from '@/components/ui/Menu';

const onClose = vi.fn();
const onEdit = vi.fn();
const onPause = vi.fn();
const onRemove = vi.fn();

function renderMenu() {
  onClose.mockClear();
  onEdit.mockClear();
  onPause.mockClear();
  onRemove.mockClear();
  return render(
    <Menu
      label="카테고리 메뉴"
      onClose={onClose}
      items={[
        { id: 'edit', label: '수정', onSelect: onEdit },
        { id: 'pause', label: '중단으로 종료', onSelect: onPause, disabled: true },
        { id: 'remove', label: '삭제', onSelect: onRemove, destructive: true },
      ]}
    />,
  );
}

describe('Menu', () => {
  it('role=menu 와 항목 역할을 갖고 첫 항목에 포커스한다', () => {
    renderMenu();
    expect(screen.getByRole('menu', { name: '카테고리 메뉴' })).toBeInTheDocument();
    expect(screen.getAllByRole('menuitem')).toHaveLength(3);
    expect(document.activeElement).toBe(screen.getByRole('menuitem', { name: '수정' }));
  });

  it('↑↓ 는 끝에서 순환하고 Home/End 는 처음·끝으로 간다', async () => {
    const user = userEvent.setup();
    renderMenu();
    const [edit, pause, remove] = screen.getAllByRole('menuitem');

    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(pause);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(document.activeElement).toBe(edit);
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(remove);
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(edit);
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(remove);
  });

  it('글자를 누르면 그 글자로 시작하는 항목으로 이동하지만 IME 조합 중에는 움직이지 않는다', () => {
    renderMenu();
    const [edit, , remove] = screen.getAllByRole('menuitem');

    fireEvent.keyDown(edit, { key: '삭', keyCode: 229 });
    fireEvent.keyDown(edit, { key: '삭', isComposing: true });
    expect(document.activeElement).toBe(edit);

    fireEvent.keyDown(edit, { key: '삭' });
    expect(document.activeElement).toBe(remove);
  });

  it('항목을 고르면 실행 후 닫히고 비활성 항목은 실행되지 않는다', async () => {
    const user = userEvent.setup();
    renderMenu();

    await user.click(screen.getByRole('menuitem', { name: '중단으로 종료' }));
    expect(onPause).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('menuitem', { name: '수정' }));
    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Esc 는 메뉴를 닫는다', () => {
    renderMenu();
    fireEvent.keyDown(screen.getByRole('menuitem', { name: '수정' }), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
