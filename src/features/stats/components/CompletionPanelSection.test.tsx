// 인사이트 패널 달성률 섹션 + 토글 통합 (R1~R4·R7·R8, §2). 카테고리별 막대(옛 CategoryPanelSection)는
// 폐지됐다 — 그 값은 이제 카테고리 그룹 헤더에서 보인다(`TodoGroupSection.test.tsx`).
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { CompletionHeader } from '@/features/stats/components/CompletionHeader';
import { CompletionPanelSection } from '@/features/stats/components/CompletionPanelSection';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

const STUDY = makeCategory({ seq: 1, order: 0, name: '공부' });
const EXERCISE = makeCategory({ seq: 2, order: 1, name: '운동' });

/** 공부 1/3 + 운동 2/2 = 5개 중 3개. 그룹마다 수가 달라야 값이 섞이면 드러난다. */
function mixedTodos() {
  return [
    makeTodo({ seq: 1, categoryId: STUDY.id, done: true }),
    makeTodo({ seq: 2, categoryId: STUDY.id }),
    makeTodo({ seq: 3, categoryId: STUDY.id }),
    makeTodo({ seq: 4, categoryId: EXERCISE.id, done: true }),
    makeTodo({ seq: 5, categoryId: EXERCISE.id, done: true }),
  ];
}

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({
    byId: Object.fromEntries(mixedTodos().map((todo) => [todo.id, todo])),
    date: FIXTURE_DATE,
    status: 'ready',
    error: null,
  });
});

describe('CompletionPanelSection', () => {
  it('제목이 붙은 섹션 안에 큰 링과 숫자를 그린다 (§2, R7)', () => {
    render(<CompletionPanelSection />);

    expect(screen.getByRole('region', { name: '오늘 달성률' })).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '오늘 달성률 60퍼센트, 5개 중 3개 완료' }),
    ).toBeInTheDocument();
    expect(screen.getByText('3 / 5')).toBeInTheDocument();
  });

  it('패널 링은 헤더 링보다 크다 (R7: 120 대 40)', () => {
    const header = render(<CompletionHeader />);
    const headerSize = header.container.querySelector('svg')?.getAttribute('width');
    header.unmount();

    const panel = render(<CompletionPanelSection />);

    expect(headerSize).toBe('40');
    expect(panel.container.querySelector('svg')).toHaveAttribute('width', '120');
  });
});

describe('토글 통합 (R8)', () => {
  it('하나를 완료하면 링·숫자가 같은 갱신에서 함께 움직인다', async () => {
    render(<CompletionHeader />);
    const target = useTodoStore.getState().byId;
    const undone = Object.values(target).find((todo) => !todo.done && todo.categoryId === STUDY.id);

    expect(screen.getByText('60%')).toBeInTheDocument();

    await act(async () => {
      await useTodoStore.getState().toggleDone(undone?.id ?? '', true);
    });

    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('4 / 5')).toBeInTheDocument();
    expect(
      screen.getByRole('img', { name: '오늘 달성률 80퍼센트, 5개 중 4개 완료' }),
    ).toBeInTheDocument();
  });

  it('남은 하나까지 완료하면 100%와 축하 문구가 함께 나온다 (R2·R4)', async () => {
    render(<CompletionHeader />);
    const remaining = Object.values(useTodoStore.getState().byId).filter((todo) => !todo.done);

    for (const todo of remaining) {
      await act(async () => {
        await useTodoStore.getState().toggleDone(todo.id, true);
      });
    }

    expect(screen.getByText('100%')).toBeInTheDocument();
    expect(screen.getByText('다 했어요 🎉')).toBeInTheDocument();
  });
});
