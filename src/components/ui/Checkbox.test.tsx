import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Checkbox } from '@/components/ui/Checkbox';

describe('Checkbox', () => {
  it('checkbox 역할과 label 로 조회되고 클릭하면 다음 상태를 넘긴다', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox checked={false} onCheckedChange={onCheckedChange} label="물 2L 마시기" />);

    await userEvent.click(screen.getByRole('checkbox', { name: '물 2L 마시기' }));

    expect(onCheckedChange).toHaveBeenCalledWith(true);
  });

  it('체크된 상태에서 Space 를 누르면 해제 상태를 넘긴다', async () => {
    const onCheckedChange = vi.fn();
    render(<Checkbox checked onCheckedChange={onCheckedChange} label="물 2L 마시기" />);

    const checkbox = screen.getByRole('checkbox', { name: '물 2L 마시기' });
    expect(checkbox).toBeChecked();
    await userEvent.tab();
    expect(checkbox).toHaveFocus();
    await userEvent.keyboard(' ');

    expect(onCheckedChange).toHaveBeenCalledWith(false);
  });

  it('labelledBy 로 화면에 보이는 제목을 이름으로 쓴다', () => {
    render(
      <>
        <span id="todo-title-1">스트레칭 10분</span>
        <Checkbox checked={false} onCheckedChange={vi.fn()} labelledBy="todo-title-1" />
      </>,
    );

    expect(screen.getByRole('checkbox', { name: '스트레칭 10분' })).toBeInTheDocument();
  });

  it('비활성이면 토글되지 않는다', async () => {
    const onCheckedChange = vi.fn();
    render(
      <Checkbox checked={false} onCheckedChange={onCheckedChange} disabled label="읽기 전용" />,
    );

    const checkbox = screen.getByRole('checkbox', { name: '읽기 전용' });
    expect(checkbox).toBeDisabled();
    await userEvent.click(checkbox);

    expect(onCheckedChange).not.toHaveBeenCalled();
  });
});
