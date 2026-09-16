import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommandLayer } from '@/features/command/components/CommandLayer';
import { useDocumentedShortcuts } from '@/features/command/hooks/useShortcut';
import { useCommandStore } from '@/features/command/store/command-store';
import { ITEM_SHORTCUT_IDS } from '@/features/command/store/shortcut-catalog';
import { DuplicateShortcutError } from '@/features/command/store/shortcut-registry';

beforeEach(() => {
  useCommandStore.setState({ shortcuts: [], commands: [], helpOpen: false, paletteOpen: false });
  Object.defineProperty(window.navigator, 'platform', {
    value: 'Linux x86_64',
    configurable: true,
  });
});

describe('CommandLayer', () => {
  it('? 로 도움말을 열고 Esc 로 닫는다 — 키보드만으로', async () => {
    const user = userEvent.setup();
    render(<CommandLayer />);
    expect(screen.queryByRole('dialog')).toBeNull();

    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: '단축키' });
    expect(dialog).toBeInTheDocument();
    // 열리면 포커스가 대화상자 안으로 들어간다(Dialog 프리미티브 규칙).
    expect(dialog.contains(document.activeElement)).toBe(true);

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('도움말에 자기 단축키만 실린다 — 처리기가 없는 항목 키는 싣지 않는다(R5)', async () => {
    const user = userEvent.setup();
    render(<CommandLayer />);
    await user.keyboard('?');
    expect(await screen.findByRole('rowheader', { name: '단축키 도움말' })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: '명령 팔레트 열기' })).toBeInTheDocument();
    // T-15 가 아직 Space 를 처리하지 않는다 — 도움말에 먼저 나타나면 눌러도 아무 일이 없는 문서가 된다.
    expect(screen.queryByRole('rowheader', { name: /완료 표시/ })).toBeNull();
  });

  it('항목 키를 처리하는 쪽이 등록하면 그때 도움말에 나타난다(R5 의 이음새 — T-15)', async () => {
    const user = userEvent.setup();
    function TodoListStub() {
      useDocumentedShortcuts(ITEM_SHORTCUT_IDS);
      return null;
    }
    render(
      <>
        <CommandLayer />
        <TodoListStub />
      </>,
    );
    await user.keyboard('?');
    expect(await screen.findByRole('rowheader', { name: /완료 표시/ })).toBeInTheDocument();
    expect(screen.getByRole('rowheader', { name: /위로 옮기기/ })).toBeInTheDocument();
  });

  it('도움말이 열려 있는 동안 ? 가 다시 먹지 않는다(오버레이 가드)', async () => {
    const user = userEvent.setup();
    render(<CommandLayer />);
    await user.keyboard('?');
    await screen.findByRole('dialog');
    await user.keyboard('?');
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    expect(useCommandStore.getState().helpOpen).toBe(true);
  });

  it('입력 중에는 ? 가 도움말을 열지 않는다(R1)', async () => {
    const user = userEvent.setup();
    render(
      <>
        <CommandLayer />
        <input aria-label="제목" />
      </>,
    );
    await user.click(screen.getByLabelText('제목'));
    await user.keyboard('?');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByLabelText('제목')).toHaveValue('?');
  });

  it('Mod+K 는 팔레트 상태를 켜고, 준 노드를 그때만 그린다', async () => {
    const user = userEvent.setup();
    render(<CommandLayer palette={<div data-testid="palette">팔레트</div>} />);
    expect(screen.queryByTestId('palette')).toBeNull();
    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByTestId('palette')).toBeInTheDocument();
    expect(useCommandStore.getState().paletteOpen).toBe(true);
  });

  it('팔레트 노드를 주지 않아도 Mod+K 가 앱을 깨뜨리지 않는다(컷 라인 대비)', async () => {
    const user = userEvent.setup();
    render(<CommandLayer />);
    await user.keyboard('{Control>}k{/Control}');
    expect(useCommandStore.getState().paletteOpen).toBe(true);
  });

  it('언마운트하면 등록이 전부 풀린다', () => {
    const { unmount } = render(<CommandLayer />);
    // 자기 것 둘뿐이다(help.open · palette.open) — 항목 키는 처리하는 쪽이 등록한다.
    expect(useCommandStore.getState().shortcuts).toHaveLength(2);
    unmount();
    expect(useCommandStore.getState().shortcuts).toEqual([]);
  });

  it('두 번 마운트하면 개발에서는 중복으로 터진다 — T-20 은 한 번만 마운트한다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <>
          <CommandLayer />
          <CommandLayer />
        </>,
      ),
    ).toThrow(DuplicateShortcutError);
    spy.mockRestore();
  });
});
