import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ShortcutKeys } from '@/features/command/components/ShortcutKeys';
import { parseChord } from '@/features/command/lib/key-chord';
import { chordsOf } from '@/features/command/store/shortcut-registry';

describe('ShortcutKeys', () => {
  it('조합을 kbd 칩으로 그린다', () => {
    const { container } = render(<ShortcutKeys chords={[parseChord('Mod+K')]} isMac={false} />);
    const chips = Array.from(container.querySelectorAll('kbd')).map((el) => el.textContent);
    expect(chips).toEqual(['Ctrl', 'K']);
  });

  it('플랫폼에 따라 표기가 바뀐다(R3)', () => {
    const { container } = render(<ShortcutKeys chords={[parseChord('Mod+K')]} isMac />);
    expect(Array.from(container.querySelectorAll('kbd')).map((el) => el.textContent)).toEqual([
      '⌘',
      'K',
    ]);
  });

  it('기호 칩은 보조기술에서 감춰지고, 읽히는 이름은 한국어 문장이다', () => {
    const { container } = render(<ShortcutKeys chords={[parseChord('Mod+K')]} isMac />);
    const hidden = container.querySelector('[aria-hidden="true"]');
    expect(hidden?.querySelectorAll('kbd')).toHaveLength(2);
    // 낭독되는 텍스트에 기호가 남아 있으면 "커맨드" 대신 무음이 된다.
    expect(screen.getByText('커맨드 + K')).toBeInTheDocument();
    expect(screen.getByText('커맨드 + K')).toHaveClass('sr-only');
  });

  it('조합이 둘이면 "또는" 으로 잇고 둘 다 읽는다', () => {
    const { container } = render(<ShortcutKeys chords={chordsOf('todo.remove')} isMac={false} />);
    expect(Array.from(container.querySelectorAll('kbd')).map((el) => el.textContent)).toEqual([
      'Delete',
      'Backspace',
    ]);
    expect(screen.getByText('딜리트 또는 백스페이스')).toBeInTheDocument();
  });

  it('화살표·스페이스도 읽을 수 있는 이름을 갖는다', () => {
    render(<ShortcutKeys chords={[parseChord('Shift+ArrowLeft')]} isMac={false} />);
    expect(screen.getByText('시프트 + 왼쪽 화살표')).toBeInTheDocument();
  });
});
