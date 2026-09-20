import { render, screen, within } from '@testing-library/react';
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
      await screen.findByRole('heading', { level: 3, name: '달성률 추이' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '카테고리 비율' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '연속 달성' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '집중 시간' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: '활동 히트맵' })).toBeInTheDocument();
  });

  it('통계 닫기 버튼은 closeReports 를 부른다', async () => {
    await seed();
    const user = userEvent.setup();
    useReportsStore.getState().openReports();
    render(<ReportsScreen />);
    await screen.findByRole('heading', { level: 3, name: '달성률 추이' });

    await user.click(screen.getByRole('button', { name: '통계 닫기' }));

    expect(useReportsStore.getState().open).toBe(false);
  });

  it('Esc 로 닫힌다(review m11 — 앱의 다른 모든 겹침과 같은 규약)', async () => {
    await seed();
    const user = userEvent.setup();
    useReportsStore.getState().openReports();
    render(<ReportsScreen />);
    await screen.findByRole('heading', { level: 3, name: '달성률 추이' });

    await user.keyboard('{Escape}');

    expect(useReportsStore.getState().open).toBe(false);
  });

  it('키보드만으로 기간을 바꾸면 카드가 새 기간으로 다시 채워진다', async () => {
    await seed();
    const user = userEvent.setup();
    render(<ReportsScreen />);
    await screen.findByRole('heading', { level: 3, name: '달성률 추이' });

    const thisYear = screen.getByRole('radio', { name: '올해' });
    thisYear.focus();
    await user.keyboard(' ');

    expect(thisYear).toBeChecked();
    // 다시 로딩 → 다시 카드가 뜬다(같은 화면이 새 기간으로 갱신됐다는 증거).
    expect(
      await screen.findByRole('heading', { level: 3, name: '달성률 추이' }),
    ).toBeInTheDocument();
  });

  it('[다시 시도]는 화면을 닫지 않고 다시 읽으며, 포커스를 잃지 않는다(review M3)', async () => {
    const base = createMemoryRepositories();
    const failing = {
      ...base,
      todos: {
        ...base.todos,
        listByDateRange: () => Promise.reject(new Error('boom')),
      },
    };
    setRepositories(failing);
    const user = userEvent.setup();
    useReportsStore.getState().openReports();
    render(<ReportsScreen />);

    const retry = await screen.findByRole('button', { name: '다시 시도' });
    await user.click(retry);

    // 재시도도 실패하지만(같은 저장소) 화면은 열려 있고, 버튼은 그 자리에 그대로다 —
    // `closeReports` 로 잘못 연결됐을 때와 달리 화면이 닫히지 않는다(포커스도 유지된다).
    expect(useReportsStore.getState().open).toBe(true);
    expect(screen.getByRole('button', { name: '다시 시도' })).toHaveFocus();
  });

  it('오늘 투두 2개 중 1개만 완료해도 "연속 달성" 카드가 "기록 없음"이라 거짓말하지 않는다(review M4 실사용 재현)', async () => {
    const repo = createMemoryRepositories();
    const category = adopt(makeCategory({ name: '공부' }));
    await repo.categories.upsert(category);
    await repo.todos.upsert(
      adopt(makeTodo({ seq: 1, date: TODAY, categoryId: category.id, done: true })),
    );
    await repo.todos.upsert(
      adopt(makeTodo({ seq: 2, date: TODAY, categoryId: category.id, done: false })),
    );
    setRepositories(repo);
    render(<ReportsScreen />);

    const categoryCard = (
      await screen.findByRole('heading', { level: 3, name: '카테고리 비율' })
    ).closest('section')!;
    expect(within(categoryCard).getByRole('progressbar')).toHaveAttribute(
      'aria-valuetext',
      '2개 중 1개 완료',
    );

    const streakCard = screen
      .getByRole('heading', { level: 3, name: '연속 달성' })
      .closest('section')!;
    expect(within(streakCard).getByText('오늘 아직 다 못 했어요')).toBeInTheDocument();
    expect(within(streakCard).queryByText(/기록이 없어요/)).not.toBeInTheDocument();
  });
});
