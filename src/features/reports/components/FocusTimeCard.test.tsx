import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { FOCUS_SUMMARY_NONE_KEY } from '@/domain/todo/focus-summary';

import { FocusTimeCard } from '@/features/reports/components/FocusTimeCard';
import { FOCUS_OTHER_KEY } from '@/features/reports/lib/period-summary';

describe('FocusTimeCard (stats.md R5)', () => {
  it('총 시간과 투두별 줄을 보여준다', () => {
    render(
      <FocusTimeCard
        totalSeconds={12000}
        byTodo={[{ key: 'todo-1', seconds: 12000 }]}
        todoTitles={new Map([['todo-1', '장보기']])}
      />,
    );

    expect(screen.getByText('총 3시간 20분')).toBeInTheDocument();
    expect(screen.getByText('장보기')).toBeInTheDocument();
  });

  it('할 일 없이 집중한 세션은 전용 라벨로 보여준다', () => {
    render(
      <FocusTimeCard
        totalSeconds={60}
        byTodo={[{ key: FOCUS_SUMMARY_NONE_KEY, seconds: 60 }]}
        todoTitles={new Map()}
      />,
    );

    expect(screen.getByText('할 일 없이 집중')).toBeInTheDocument();
  });

  it('상위 5개 밖으로 밀린 나머지는 "기타"로 보여준다', () => {
    render(
      <FocusTimeCard
        totalSeconds={100}
        byTodo={[{ key: FOCUS_OTHER_KEY, seconds: 100 }]}
        todoTitles={new Map()}
      />,
    );

    expect(screen.getByText('기타')).toBeInTheDocument();
  });

  it('총 시간이 0이면 빈 상태 문구다', () => {
    render(<FocusTimeCard totalSeconds={0} byTodo={[]} todoTitles={new Map()} />);

    expect(screen.getByText('이 기간에 기록이 없어요')).toBeInTheDocument();
  });
});
