import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ShortcutHelpDialog } from '@/features/command/components/ShortcutHelpDialog';
import { useCommandStore } from '@/features/command/store/command-store';
import { SHORTCUTS } from '@/features/command/store/shortcut-catalog';

beforeEach(() => {
  useCommandStore.setState({ shortcuts: [], helpOpen: false });
});

function registerSome() {
  const register = useCommandStore.getState().registerShortcut;
  register('date.today', vi.fn());
  register('todo.toggle');
  register('help.open', vi.fn());
}

describe('ShortcutHelpDialog (R5)', () => {
  it('등록된 단축키에서 표를 만든다 — 수동 표가 없다', () => {
    registerSome();
    render(<ShortcutHelpDialog open onClose={vi.fn()} isMac={false} />);
    const dialog = screen.getByRole('dialog', { name: '단축키' });
    expect(within(dialog).getByRole('rowheader', { name: '오늘로' })).toBeInTheDocument();
    expect(
      within(dialog).getByRole('rowheader', { name: SHORTCUTS['todo.toggle'].description }),
    ).toBeInTheDocument();
    // 등록하지 않은 것은 나오지 않는다.
    expect(within(dialog).queryByRole('rowheader', { name: '하루 전으로' })).toBeNull();
  });

  it('새 단축키를 등록하면 고친 곳 없이 표에 나타난다', () => {
    registerSome();
    const { rerender } = render(<ShortcutHelpDialog open onClose={vi.fn()} isMac={false} />);
    expect(screen.queryByRole('rowheader', { name: '하루 전으로' })).toBeNull();
    act(() => {
      useCommandStore.getState().registerShortcut('date.prev', vi.fn());
    });
    rerender(<ShortcutHelpDialog open onClose={vi.fn()} isMac={false} />);
    expect(screen.getByRole('rowheader', { name: '하루 전으로' })).toBeInTheDocument();
  });

  it('묶음마다 캡션이 붙은 표다(스펙 §5: 표 + kbd)', () => {
    registerSome();
    render(<ShortcutHelpDialog open onClose={vi.fn()} isMac={false} />);
    const tables = screen.getAllByRole('table');
    expect(tables.map((table) => table.querySelector('caption')?.textContent)).toEqual([
      '이동',
      '할 일',
      '화면',
    ]);
  });

  it('키는 kbd 로 그리고 낭독용 이름을 함께 둔다', () => {
    registerSome();
    render(<ShortcutHelpDialog open onClose={vi.fn()} isMac={false} />);
    const row = screen.getByRole('rowheader', { name: '단축키 도움말' }).closest('tr');
    expect(row?.querySelector('kbd')?.textContent).toBe('?');
    expect(within(row as HTMLElement).getByText('물음표')).toBeInTheDocument();
  });

  it('플랫폼 표기를 따른다(R3)', () => {
    useCommandStore.getState().registerShortcut('palette.open', vi.fn());
    const { rerender } = render(<ShortcutHelpDialog open onClose={vi.fn()} isMac={false} />);
    expect(screen.getByText('컨트롤 + K')).toBeInTheDocument();
    rerender(<ShortcutHelpDialog open onClose={vi.fn()} isMac />);
    expect(screen.getByText('커맨드 + K')).toBeInTheDocument();
  });

  it('등록이 하나도 없으면 빈 문구를 보여 준다', () => {
    render(<ShortcutHelpDialog open onClose={vi.fn()} isMac={false} />);
    expect(screen.getByText('아직 등록된 단축키가 없어요.')).toBeInTheDocument();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('닫혀 있으면 아무것도 그리지 않는다', () => {
    registerSome();
    render(<ShortcutHelpDialog open={false} onClose={vi.fn()} isMac={false} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Esc 로 닫힌다', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    registerSome();
    render(<ShortcutHelpDialog open onClose={onClose} isMac={false} />);
    await user.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('한글 조합을 끝내는 Esc 로는 닫히지 않는다(app-shell R14)', () => {
    const onClose = vi.fn();
    registerSome();
    render(<ShortcutHelpDialog open onClose={onClose} isMac={false} />);
    document.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, isComposing: true }),
    );
    expect(onClose).not.toHaveBeenCalled();
  });
});
