import { useState } from 'react';

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useShortcut, useDocumentedShortcuts } from '@/features/command/hooks/useShortcut';
import { useCommandStore } from '@/features/command/store/command-store';
import { ITEM_SHORTCUT_IDS } from '@/features/command/store/shortcut-catalog';
import { DuplicateShortcutError } from '@/features/command/store/shortcut-registry';

beforeEach(() => {
  useCommandStore.setState({ shortcuts: [], commands: [] });
});

function Registrar({ run, enabled = true }: { run: () => void; enabled?: boolean }) {
  useShortcut('date.next', run, { enabled });
  return <span>등록됨</span>;
}

describe('useShortcut', () => {
  it('마운트 동안만 등록돼 있다', () => {
    const { unmount } = render(<Registrar run={vi.fn()} />);
    expect(useCommandStore.getState().shortcuts.map((s) => s.id)).toEqual(['date.next']);
    unmount();
    expect(useCommandStore.getState().shortcuts).toEqual([]);
  });

  it('enabled 가 거짓이면 등록하지 않는다', () => {
    render(<Registrar run={vi.fn()} enabled={false} />);
    expect(useCommandStore.getState().shortcuts).toEqual([]);
  });

  it('핸들러가 바뀌어도 다시 등록하지 않고 최신 핸들러를 부른다', async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();

    function Swapper() {
      const [flipped, setFlipped] = useState(false);
      useShortcut('date.next', flipped ? second : first);
      return <button onClick={() => setFlipped(true)}>바꾸기</button>;
    }

    render(<Swapper />);
    const entry = useCommandStore.getState().shortcuts[0];
    await user.click(screen.getByRole('button', { name: '바꾸기' }));
    // 같은 등록 객체가 그대로다 = 해제·재등록이 없었다.
    expect(useCommandStore.getState().shortcuts[0]).toBe(entry);

    entry.run?.(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('두 컴포넌트가 같은 단축키를 등록하면 던진다 — 조용히 하나가 이기지 않는다', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() =>
      render(
        <>
          <Registrar run={vi.fn()} />
          <Registrar run={vi.fn()} />
        </>,
      ),
    ).toThrow(DuplicateShortcutError);
    spy.mockRestore();
  });
});

describe('useDocumentedShortcuts', () => {
  function Docs() {
    useDocumentedShortcuts(ITEM_SHORTCUT_IDS);
    return <span>문서</span>;
  }

  it('항목 포커스 키를 도움말용으로만 등록한다(핸들러 없음)', () => {
    const { unmount } = render(<Docs />);
    const registered = useCommandStore.getState().shortcuts;
    expect(registered.map((s) => s.id)).toEqual([...ITEM_SHORTCUT_IDS]);
    expect(registered.every((s) => s.run === undefined)).toBe(true);
    unmount();
    expect(useCommandStore.getState().shortcuts).toEqual([]);
  });
});
