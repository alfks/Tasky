import { useState } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ColorSwatchGroup } from '@/components/ui/ColorSwatchGroup';

/** theme.md §3-C 12색 중 앞 네 개. 값의 단일 소스는 도메인 상수이고 여기서는 픽스처로만 쓴다. */
const OPTIONS = [
  { id: 'coral', name: '코랄', color: '#FF8FA3' },
  { id: 'peach', name: '피치', color: '#FFB38A' },
  { id: 'orange', name: '오렌지', color: '#FFC978' },
  { id: 'yellow', name: '옐로', color: '#FFEB99' },
] as const;

function Harness({ onChange }: { onChange?: (id: string) => void }) {
  const [value, setValue] = useState('peach');
  return (
    <ColorSwatchGroup
      label="카테고리 색"
      options={OPTIONS}
      value={value}
      onChange={(id) => {
        setValue(id);
        onChange?.(id);
      }}
    />
  );
}

describe('ColorSwatchGroup', () => {
  it('라디오 그룹 의미론을 갖고 선택된 색만 aria-checked 다', () => {
    render(<Harness />);
    expect(screen.getByRole('radiogroup', { name: '카테고리 색' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: '피치' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '코랄' })).not.toBeChecked();
  });

  it('선택 상태가 색 말고 체크 표시로도 드러난다', () => {
    render(<Harness />);
    expect(screen.getByRole('radio', { name: '피치' })).toHaveTextContent('✓');
    expect(screen.getByRole('radio', { name: '코랄' })).not.toHaveTextContent('✓');
  });

  it('탭 진입점은 선택된 색 하나뿐이다', () => {
    render(<Harness />);
    expect(screen.getByRole('radio', { name: '피치' })).toHaveAttribute('tabindex', '0');
    expect(screen.getByRole('radio', { name: '코랄' })).toHaveAttribute('tabindex', '-1');
  });

  it('방향키로 이동하며 선택이 따라오고 끝에서 순환한다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    screen.getByRole('radio', { name: '피치' }).focus();

    await user.keyboard('{ArrowRight}');
    expect(onChange).toHaveBeenLastCalledWith('orange');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '오렌지' }));

    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '코랄' }));

    await user.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '옐로' }));

    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '코랄' }));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(screen.getByRole('radio', { name: '옐로' }));
  });

  it('IME 조합 중 방향키는 선택을 옮기지 않는다', () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    const peach = screen.getByRole('radio', { name: '피치' });
    peach.focus();

    fireEvent.keyDown(peach, { key: 'ArrowRight', keyCode: 229 });
    fireEvent.keyDown(peach, { key: 'ArrowRight', isComposing: true });
    expect(onChange).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(peach);
  });

  it('클릭으로도 선택된다', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    await user.click(screen.getByRole('radio', { name: '옐로' }));
    expect(onChange).toHaveBeenCalledWith('yellow');
    expect(screen.getByRole('radio', { name: '옐로' })).toBeChecked();
  });
});
