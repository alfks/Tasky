// `useCompletion` · `useCategoryBars` — 스토어 상태가 달성률로 이어지는지 (R1·R6, §2 상태).
//
// 픽스처는 비대칭이다: 카테고리마다 완료/전체를 다르게 둬야 done 과 total 을 맞바꾸거나
// 그룹 순서를 뒤집어도 같은 값이 나오는 일이 없다.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { completionCounts } from '@/domain/todo/completion-rate';
import type { Todo } from '@/domain/todo/todo';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useCategoryBars, useCompletion } from '@/features/stats/hooks/useCompletion';
import { useTodoActions, useTodoStore } from '@/features/todo';
import type { TodoLoadStatus } from '@/features/todo';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

const STUDY = makeCategory({ seq: 8, order: 0, name: '공부' });
const EXERCISE = makeCategory({ seq: 7, order: 1, name: '운동' });

/** 공부 3개 중 1개 완료 + 운동 2개 전부 완료 = 그날 5개 중 3개 완료(60%). */
function fixtureTodos(): Todo[] {
  return [
    makeTodo({ seq: 1, categoryId: STUDY.id, done: true }),
    makeTodo({ seq: 2, categoryId: STUDY.id }),
    makeTodo({ seq: 3, categoryId: STUDY.id }),
    makeTodo({ seq: 4, categoryId: EXERCISE.id, done: true }),
    makeTodo({ seq: 5, categoryId: EXERCISE.id, done: true }),
  ];
}

function seed(todos: readonly Todo[], status: TodoLoadStatus = 'ready'): void {
  useTodoStore.setState({
    byId: Object.fromEntries(todos.map((todo) => [todo.id, todo])),
    date: FIXTURE_DATE,
    status,
    error: null,
  });
}

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
});

describe('useCompletion (R1~R3)', () => {
  it('스토어의 그날 투두 전부로 비율을 낸다', () => {
    seed(fixtureTodos());

    const { result } = renderHook(() => useCompletion());

    expect(result.current).toMatchObject({ done: 3, total: 5, rate: 0.6, percent: 60 });
  });

  it('투두가 없으면 비율이 정의되지 않는다', () => {
    seed([]);

    expect(renderHook(() => useCompletion()).result.current.rate).toBeNull();
  });

  it('조회에 실패하면 메모리에 값이 남아 있어도 — 로 떨어진다 (§2 에러)', () => {
    seed(fixtureTodos(), 'error');

    const { result } = renderHook(() => useCompletion());

    expect(result.current.percent).toBeNull();
    expect(result.current.total).toBe(0);
  });

  it('적재 중에는 이전 값을 그대로 유지한다 (§2 로딩)', () => {
    seed(fixtureTodos(), 'loading');

    expect(renderHook(() => useCompletion()).result.current.percent).toBe(60);
  });

  it('도메인 `completionCounts` 와 같은 수를 낸다 (R8 단일 원천)', () => {
    const todos = fixtureTodos();
    seed(todos);

    const { result } = renderHook(() => useCompletion());

    expect({ done: result.current.done, total: result.current.total }).toEqual(
      completionCounts(todos),
    );
  });

  it('토글하면 같은 갱신에서 값이 바뀐다 (R6)', async () => {
    const { result } = renderHook(() => ({
      summary: useCompletion(),
      actions: useTodoActions(),
    }));

    await act(async () => {
      await result.current.actions.loadDate(FIXTURE_DATE);
      await result.current.actions.addTodo({ categoryId: STUDY.id, title: '단어 외우기' });
      await result.current.actions.addTodo({ categoryId: STUDY.id, title: '문제 풀기' });
      await result.current.actions.addTodo({ categoryId: STUDY.id, title: '복습' });
    });
    expect(result.current.summary).toMatchObject({ done: 0, total: 3, percent: 0 });

    const target = useTodoStore.getState().byId;
    const firstId = Object.keys(target)[0];
    await act(async () => {
      await result.current.actions.toggleDone(firstId, true);
    });

    expect(result.current.summary).toMatchObject({ done: 1, total: 3, percent: 33 });
  });
});

describe('useCategoryBars (R5)', () => {
  it('카테고리마다 자기 투두만 세고 화면 순서로 준다', () => {
    seed(fixtureTodos());

    // 인자를 뒤집어 넘긴다 — 입력 순서를 그대로 흘리면 운동이 먼저 나온다.
    const { result } = renderHook(() => useCategoryBars([EXERCISE, STUDY]));

    expect(result.current.map((bar) => [bar.label, bar.done, bar.total])).toEqual([
      ['공부', 1, 3],
      ['운동', 2, 2],
    ]);
  });

  it('조회에 실패하면 막대도 사라진다', () => {
    seed(fixtureTodos(), 'error');

    expect(renderHook(() => useCategoryBars([STUDY, EXERCISE])).result.current).toEqual([]);
  });
});
