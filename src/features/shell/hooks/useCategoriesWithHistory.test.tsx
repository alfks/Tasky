// tombstone 복원 배선 (category R17·R22) — 두 feature(todo·category)를 잇는 것은 셸의 일이다.
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { Persistable } from '@/domain/meta';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useCategoriesWithHistory } from '@/features/shell/hooks/useCategoriesWithHistory';
import { useTodoStore } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

const 공부 = makeCategory({ seq: 1, name: '공부' });
const 요리_툼스톤 = makeCategory({ seq: 2, name: '요리', deletedAt: '2026-01-16T00:00:00.000Z' });
const 숨긴_툼스톤 = makeCategory({
  seq: 3,
  name: '숨김',
  deletedAt: '2026-01-16T00:00:00.000Z',
  historyHidden: true,
});

function Probe({ categories }: { categories: Category[] }) {
  const resolved = useCategoriesWithHistory(categories);
  return <div data-testid="result">{resolved.map((c) => c.name).join(',')}</div>;
}

function seedTodo(category: Category): void {
  const todo = makeTodo({ seq: 10, categoryId: category.id, title: '김치찌개' });
  useTodoStore.setState({
    byId: { [todo.id]: todo },
    date: FIXTURE_DATE,
    status: 'ready',
    error: null,
  });
}

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
});

describe('useCategoriesWithHistory', () => {
  it('참조하는 tombstone 이 없으면 그대로 돌려준다', async () => {
    render(<Probe categories={[공부]} />);
    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('공부'));
    expect(screen.getByTestId('result')).toHaveTextContent('공부');
  });

  it('메모리의 투두가 가리키는 tombstone 을 찾아 덧붙인다', async () => {
    const repositories = createMemoryRepositories();
    setRepositories(repositories);
    await repositories.categories.upsert(요리_툼스톤 as Persistable<Category>);
    seedTodo(요리_툼스톤);

    render(<Probe categories={[공부]} />);

    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('요리'));
    expect(screen.getByTestId('result')).toHaveTextContent('공부,요리');
  });

  it('historyHidden 이 켜진 tombstone 은 붙이지 않는다 (R22)', async () => {
    const repositories = createMemoryRepositories();
    setRepositories(repositories);
    await repositories.categories.upsert(숨긴_툼스톤 as Persistable<Category>);
    seedTodo(숨긴_툼스톤);

    render(<Probe categories={[공부]} />);

    // 조회 자체는 끝났지만(빈 결과) 이름은 끝내 붙지 않는다 — 고정된 시간만큼 기다려 확인한다.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByTestId('result')).toHaveTextContent('공부');
    expect(screen.getByTestId('result')).not.toHaveTextContent('숨김');
  });

  it('조회가 실패해도 기존 목록을 그대로 돌려준다', async () => {
    const repositories = createMemoryRepositories();
    setRepositories({
      ...repositories,
      categories: {
        ...repositories.categories,
        listDeletedByIds: () => Promise.reject(new Error('boom')),
      },
    });
    seedTodo(요리_툼스톤);

    render(<Probe categories={[공부]} />);

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(screen.getByTestId('result')).toHaveTextContent('공부');
  });

  it('이미 아는 카테고리(활성·종료)를 참조하는 투두는 다시 조회하지 않는다', async () => {
    const repositories = createMemoryRepositories();
    let calls = 0;
    setRepositories({
      ...repositories,
      categories: {
        ...repositories.categories,
        listDeletedByIds: (ids) => {
          calls += 1;
          return repositories.categories.listDeletedByIds(ids);
        },
      },
    });
    seedTodo(공부);

    render(<Probe categories={[공부]} />);

    await waitFor(() => expect(screen.getByTestId('result')).toHaveTextContent('공부'));
    expect(calls).toBe(0);
  });
});
