import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { DateStripHeader } from '@/features/date-strip/components/DateStripHeader';
import { MAX_DATE_KEY, MIN_DATE_KEY } from '@/features/date-strip/lib/week';

function renderHeader(props: Partial<Parameters<typeof DateStripHeader>[0]> = {}) {
  const onSelect = vi.fn();
  render(
    <DateStripHeader
      weekStart="2026-09-14"
      selectedDate="2026-09-17"
      today="2026-09-17"
      previousWeek="2026-09-10"
      nextWeek="2026-09-24"
      onSelect={onSelect}
      {...props}
    />,
  );
  return { onSelect };
}

const monthButton = () => screen.getByRole('button', { name: /2026년 9월/ });

describe('R11. 월 표시는 YYYY년 M월 이고 이동 버튼에는 이름이 있다', () => {
  it('보이는 주의 월을 YYYY년 M월 로 적는다', () => {
    renderHeader();
    expect(monthButton()).toBeInTheDocument();
  });

  it('‹ › [오늘] 에 각각 접근 가능한 이름이 있다', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: '이전 주' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '다음 주' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '오늘로 이동' })).toBeInTheDocument();
  });
});

describe('§2-A. 월 표시를 누르면 네이티브 날짜 입력으로 아무 날짜나 점프할 수 있다', () => {
  it('키보드만으로 열고 날짜를 확정하면 그 날이 선택되고 포커스가 돌아온다', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderHeader();

    monthButton().focus();
    await user.keyboard('{Enter}');

    const input = screen.getByLabelText('날짜 선택');
    expect(input).toHaveFocus();
    // input[type=date] 는 문자 입력이 아니라 값 확정(change)으로 다룬다 — 한글 IME 조합이 끼어들 여지가 없다.
    fireEvent.change(input, { target: { value: '2026-12-25' } });

    expect(onSelect).toHaveBeenCalledWith('2026-12-25');
    expect(screen.queryByLabelText('날짜 선택')).not.toBeInTheDocument();
    expect(monthButton()).toHaveFocus();
  });

  it('Esc 를 누르면 닫히고 포커스가 월 버튼으로 돌아온다', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderHeader();

    await user.click(monthButton());
    expect(screen.getByLabelText('날짜 선택')).toHaveFocus();

    await user.keyboard('{Escape}');
    expect(screen.queryByLabelText('날짜 선택')).not.toBeInTheDocument();
    expect(monthButton()).toHaveFocus();
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('입력 가능 범위는 이동 가능 범위와 같다 (R6)', async () => {
    const user = userEvent.setup();
    renderHeader();
    await user.click(monthButton());
    const input = screen.getByLabelText('날짜 선택');
    expect(input).toHaveAttribute('min', MIN_DATE_KEY);
    expect(input).toHaveAttribute('max', MAX_DATE_KEY);
  });

  it('형식이 아닌 값(브라우저가 비운 입력)은 선택을 바꾸지 않는다', async () => {
    const user = userEvent.setup();
    const { onSelect } = renderHeader();
    await user.click(monthButton());
    fireEvent.change(screen.getByLabelText('날짜 선택'), { target: { value: '' } });
    expect(onSelect).not.toHaveBeenCalled();
  });
});

describe('R5·R6. 범위 끝과 오늘에서 버튼이 비활성된다', () => {
  it('이동할 곳이 없으면 그 방향 버튼이 비활성이다', () => {
    renderHeader({ previousWeek: undefined, nextWeek: undefined });
    expect(screen.getByRole('button', { name: '이전 주' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다음 주' })).toBeDisabled();
  });

  it('오늘이 선택돼 있으면 [오늘] 이 비활성이다', () => {
    renderHeader();
    expect(screen.getByRole('button', { name: '오늘로 이동' })).toBeDisabled();
  });
});
