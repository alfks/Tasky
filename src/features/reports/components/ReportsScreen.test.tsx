import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { adopt } from '@/domain/meta';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useDateStripStore } from '@/features/date-strip';
import { ReportsScreen } from '@/features/reports/components/ReportsScreen';
import { useReportsStore } from '@/features/reports/store/reports-store';
import { makeCategory } from '@/test/fixtures/category';
import { makeTodo } from '@/test/fixtures/todo';

const TODAY = '2026-09-20';
const INITIAL_REPORTS_STATE = useReportsStore.getState();

beforeEach(() => {
  useReportsStore.setState(INITIAL_REPORTS_STATE, true);
  useDateStripStore.setState({ today: TODAY, selectedDate: TODAY });
});

async function seed() {
  const repo = createMemoryRepositories();
  const category = adopt(makeCategory({ name: '공부' }));
  await repo.categories.upsert(category);
  await repo.todos.upsert(
    adopt(makeTodo({ seq: 1, date: TODAY, categoryId: category.id, done: true })),
  );
  setRepositories(repo);
}

describe('ReportsScreen (stats.md §2, 화면 조립)', () => {
  it('로딩 뒤 카드 5장을 보여준다', async () => {
    await seed();
    render(<ReportsScreen />);

    expect(
      await screen.findByRole('heading', { level: 2, name: '달성률 추이' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '카테고리 비율' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '연속 달성' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '집중 시간' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: '활동 히트맵' })).toBeInTheDocument();
  });

  it('통계 닫기 버튼은 closeReports 를 부른다', async () => {
    await seed();
    const user = userEvent.setup();
    useReportsStore.getState().openReports();
    render(<ReportsScreen />);
    await screen.findByRole('heading', { level: 2, name: '달성률 추이' });

    await user.click(screen.getByRole('button', { name: '통계 닫기' }));

    expect(useReportsStore.getState().open).toBe(false);
  });

  it('키보드만으로 기간을 바꾸면 카드가 새 기간으로 다시 채워진다', async () => {
    await seed();
    const user = userEvent.setup();
    render(<ReportsScreen />);
    await screen.findByRole('heading', { level: 2, name: '달성률 추이' });

    const thisYear = screen.getByRole('radio', { name: '올해' });
    thisYear.focus();
    await user.keyboard(' ');

    expect(thisYear).toBeChecked();
    // 다시 로딩 → 다시 카드가 뜬다(같은 화면이 새 기간으로 갱신됐다는 증거).
    expect(
      await screen.findByRole('heading', { level: 2, name: '달성률 추이' }),
    ).toBeInTheDocument();
  });
});
