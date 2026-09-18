import { useState } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { EmojiPicker } from '@/components/ui/EmojiPicker';

/** 제공 목록의 앞 여덟 개. 값의 단일 소스는 도메인 상수이고 여기서는 픽스처로만 쓴다(열 수 6 + 2). */
const OPTIONS = [
  { emoji: '📝', name: '메모' },
  { emoji: '📚', name: '책' },
  { emoji: '✏️', name: '연필' },
  { emoji: '💻', name: '노트북' },
  { emoji: '💼', name: '서류 가방' },
  { emoji: '📅', name: '달력' },
  { emoji: '🏃', name: '달리기' },
  { emoji: '💪', name: '근육' },
] as const;

function Harness({ initial = '📚', onChange }: { initial?: string; onChange?: (v: string) => void }) {
  const [value, setValue] = useState(initial);
  return (
    <EmojiPicker
      label="이모지"
      options={OPTIONS}
      value={value}
      onChange={(next) => {
        setValue(next);
        onChange?.(next);
      }}
    />
  );
}

describe('EmojiPicker', () => {
  it('라디오 그룹 의미론을 갖고 이름은 이모지의 뜻이다', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: '이모지' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '책' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '메모' })).not.toBeChecked();
    // 그림 자체는 낭독되지 않는다 — 이름으로만 주소가 매겨진다.
    expect(screen.queryByRole('radio', { name: '📚' })).not.toBeInTheDocument();
  });

  it('"없음" 도 선택지이고 고르면 빈 문자열을 낸다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    const none = screen.getByRole('radio', { name: '없음' });
    expect(none).not.toBeChecked();
    await user.click(none);

    expect(onChange).toHaveBeenCalledWith('');
    expect(none).toBeChecked();
  });

  // 자유 입력 시절에 저장된 값이 목록에 없다고 사라지면 그것은 사용자 데이터 손실이다.
  it('목록 밖 값은 "직접 고른 이모지" 칸으로 남고 선택된 채로 보인다', () => {
    render(<Harness initial="🦄" />);
    const custom = screen.getByRole('radio', { name: '직접 고른 이모지 🦄' });
    expect(custom).toBeChecked();
    expect(custom).toHaveTextContent('🦄');
    // 격자에 자리를 얻었으므로 "선택된 칸이 없는" 상태가 되지 않는다.
    expect(screen.getAllByRole('radio', { checked: true })).toHaveLength(1);
  });

  it('목록 안의 값이면 "직접 고른 이모지" 칸을 만들지 않는다', () => {
    render(<Harness initial="📝" />);
    expect(screen.queryByRole('radio', { name: /직접 고른 이모지/ })).not.toBeInTheDocument();
  });

  it('탭 진입점은 선택된 칸 하나뿐이다', () => {
    render(<Harness />);
    expect(screen.getByRole('radio', { name: '책' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: '없음' })).toHaveAttribute('tabindex', '-1');
  });

  it('좌우 방향키는 한 칸, 상하는 한 줄(6칸)을 옮기고 선택이 따라온다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    // 없음 · 📝 · 📚 · ✏️ · 💻 · 💼 | 📅 · 🏃 · 💪  — 📝 는 1번 칸, 한 줄 아래는 🏃(7번)다.
    render(<Harness initial="📝" onChange={onChange} />);
    screen.getByRole('radio', { name: '메모' }).focus();

    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('📚');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '책' }));

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '없음' }));

    await user.keyboard('{ArrowRight}{ArrowDown}');
    expect(onChange).toHaveBeenLastCalledWith('🏃');
    await user.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenLastCalledWith('📝');

    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '근육' }));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '없음' }));
  });

  it('IME 조합 중 방향키는 선택을 옮기지 않는다', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const book = screen.getByRole('radio', { name: '책' });
    book.focus();

    fireEvent.keyDown(book, { key: 'ArrowRight', keyCode: 229 });
    fireEvent.keyDown(book, { key: 'ArrowRight', isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(book);
  });
});
