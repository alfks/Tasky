import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { DaySummary } from '@/domain/todo/day-summary';

import { DateCell, TODO_DRAG_MIME } from '@/features/date-strip/components/DateCell';

/** 점·✓ 는 aria-hidden 장식이라 role 로 찾을 수 없다 — 구조로 센다(§5). */
const dotsOf = (container: HTMLElement) =>
  container.querySelectorAll('[style*="--cat-color"]').length;
const badgeOf = (container: HTMLElement) => container.querySelector('svg');

function makeSummary(overrides: Partial<DaySummary> = {}): DaySummary {
  return { total: 1, doneCount: 0, isAllDone: false, dots: [], overflowCount: 0, ...overrides };
}

function renderCell(props: Partial<Parameters<typeof DateCell>[0]> = {}) {
  return render(
    <DateCell
      date="2026-09-17"
      isSelected={false}
      isToday={false}
      isFocusTarget
      isDisabled={false}
      onSelect={vi.fn()}
      onFocusCell={vi.fn()}
      onKeyDown={vi.fn()}
      {...props}
    />,
  );
}

describe('R7. 점은 최대 3개이고 4개 이상이면 3개 + "+n" 이다', () => {
  it('점 3개는 그대로 그리고 넘침 표시가 없다', () => {
    const dots = ['#AAA111', '#BBB222', '#CCC333'].map((color, i) => ({
      categoryId: `c${i}`,
      color,
    }));
    const { container } = renderCell({ summary: makeSummary({ total: 3, dots }) });
    expect(dotsOf(container)).toBe(3);
    expect(screen.queryByText(/^\+/)).not.toBeInTheDocument();
  });

  it('카테고리가 5개면 점 3개 옆에 +2 가 붙는다', () => {
    const dots = ['#AAA111', '#BBB222', '#CCC333'].map((color, i) => ({
      categoryId: `c${i}`,
      color,
    }));
    const { container } = renderCell({
      summary: makeSummary({ total: 5, dots, overflowCount: 2 }),
    });
    expect(dotsOf(container)).toBe(3);
    expect(screen.getByText('+2')).toBeInTheDocument();
  });
});

describe('R8. ✓ 배지는 전부 완료일 때만 붙는다', () => {
  it('전부 완료면 배지를 그린다', () => {
    const { container } = renderCell({
      summary: makeSummary({ total: 2, doneCount: 2, isAllDone: true }),
    });
    expect(badgeOf(container)).not.toBeNull();
  });

  it('남은 것이 있으면 배지가 없다', () => {
    const { container } = renderCell({
      summary: makeSummary({ total: 2, doneCount: 1, isAllDone: false }),
    });
    expect(badgeOf(container)).toBeNull();
  });
});

describe('§2-C. 요약이 아직 없으면 점·✓ 없이 셀만 그린다(스켈레톤 없음)', () => {
  it('요약이 undefined 면 점도 배지도 없고 날짜 숫자는 바로 보인다', () => {
    const { container } = renderCell();
    expect(dotsOf(container)).toBe(0);
    expect(badgeOf(container)).toBeNull();
    expect(screen.getByText('17')).toBeInTheDocument();
  });
});

describe('§5. 점·✓ 는 aria-hidden 이고 같은 정보가 접근성 이름에 문장으로 들어간다', () => {
  it('진행 문구가 이름 끝에 붙는다', () => {
    renderCell({ summary: makeSummary({ total: 3, doneCount: 2 }) });
    expect(
      screen.getByRole('radio', { name: '9월 17일 목요일, 할 일 3개 중 2개 완료' }),
    ).toBeInTheDocument();
  });

  it('장식 묶음은 접근성 트리에서 숨겨진다', () => {
    const { container } = renderCell({ summary: makeSummary({ total: 1 }) });
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });
});

describe('R13. 미완료 투두를 셀에 놓으면 그 날짜로 옮긴다', () => {
  it('드롭하면 투두 id 와 날짜를 넘긴다', () => {
    const onDropTodo = vi.fn();
    renderCell({ onDropTodo });
    const target = screen.getByRole('radio');
    fireEvent.drop(target, {
      dataTransfer: { getData: (type: string) => (type === TODO_DRAG_MIME ? 'todo-1' : '') },
    });
    expect(onDropTodo).toHaveBeenCalledWith('todo-1', '2026-09-17');
  });

  it('드래그가 셀 위에 있으면 점선 테두리로 드롭 가능함을 보인다', () => {
    renderCell({ onDropTodo: vi.fn() });
    const target = screen.getByRole('radio');
    expect(target.className).not.toContain('border-dashed');
    fireEvent.dragOver(target, { dataTransfer: { getData: () => '' } });
    expect(target.className).toContain('border-dashed');
    fireEvent.dragLeave(target);
    expect(target.className).not.toContain('border-dashed');
  });

  it('다른 MIME 이라 id 가 비면 아무 일도 하지 않는다', () => {
    const onDropTodo = vi.fn();
    renderCell({ onDropTodo });
    fireEvent.drop(screen.getByRole('radio'), { dataTransfer: { getData: () => '' } });
    expect(onDropTodo).not.toHaveBeenCalled();
  });

  it('범위 밖 칸은 드롭을 받지 않는다', () => {
    const onDropTodo = vi.fn();
    renderCell({ onDropTodo, isDisabled: true });
    fireEvent.drop(screen.getByRole('radio'), { dataTransfer: { getData: () => 'todo-1' } });
    expect(onDropTodo).not.toHaveBeenCalled();
  });
});

describe('calendar-layout.md §2 R12. 칸 치수는 밀도 토큰만 참조하고 px 리터럴이 없다', () => {
  it('주 보기 칸의 폭·높이·숫자·요일 글자가 --cal-* 토큰을 참조한다', () => {
    renderCell({ variant: 'week' });
    const cell = screen.getByRole('radio');
    expect(cell.className).toContain('w-[var(--cal-cell-w)]');
    expect(cell.className).toContain('h-[var(--cal-cell-h-week)]');
    expect(cell.className).not.toMatch(/\b[wh]-\[\d+px\]/);

    // 2026-09-17 은 목요일이라 요일 글자는 '목'이다.
    expect(screen.getByText('목').className).toContain('text-[length:var(--cal-weekday-text)]');
    expect(screen.getByText('17').className).toContain('text-[length:var(--cal-day-text)]');
  });

  it('월 보기 칸은 --cal-cell-h-month 를 쓰고 요일 줄은 그리지 않는다', () => {
    renderCell({ variant: 'month' });
    const cell = screen.getByRole('gridcell');
    expect(cell.className).toContain('h-[var(--cal-cell-h-month)]');
    expect(cell.className).not.toContain('h-[var(--cal-cell-h-week)]');
    expect(cell.className).not.toMatch(/\bh-\[\d+px\]/);
  });

  it('점(5px)·✓(10px) 치수는 토큰화하지 않고 그대로 둔다(R13 판독성)', () => {
    const { container } = renderCell({
      summary: makeSummary({
        total: 1,
        doneCount: 1,
        isAllDone: true,
        dots: [{ categoryId: 'c0', color: '#AAA111' }],
      }),
    });
    expect(container.querySelector('[style*="--cat-color"]')?.className).toContain('size-[5px]');
    expect(badgeOf(container)?.getAttribute('class')).toContain('size-[10px]');
  });
});

describe('R10. 모션 수치는 --motion-xfast 토큰 한 곳에만 산다', () => {
  it('셀 색 전환과 점 페이드가 같은 토큰을 참조하고 리터럴 ms 가 남아 있지 않다', () => {
    const { container } = renderCell({ summary: makeSummary() });
    const cell = screen.getByRole('radio');
    const marks = container.querySelector('[aria-hidden="true"]');

    // R10 이 걸리는 자리는 날짜를 바꿀 때 실제로 움직이는 셀 색 전환이다.
    expect(cell.className).toContain('motion-safe:transition-colors');
    expect(cell.className).toContain('motion-safe:duration-[var(--motion-xfast)]');
    expect(marks?.className).toContain('motion-safe:duration-[var(--motion-xfast)]');
    // 음성 대조: 리터럴로 되돌리면(또는 --motion-fast 로 바꾸면) 여기서 죽는다.
    for (const node of [cell.className, marks?.className ?? '']) {
      expect(node).not.toMatch(/duration-\[\d+ms\]/);
      expect(node).not.toContain('--motion-fast');
    }
  });
});
