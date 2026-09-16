// `useTodoGroups` · `useTodoGroup` — 스토어 변화가 그룹 배치(R7)로 이어지는지.
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useTodoActions } from '@/features/todo/hooks/useTodoActions';
import { useTodoGroup, useTodoGroups } from '@/features/todo/hooks/useTodoGroups';
import { useTodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID } from '@/test/fixtures/todo';

const CATEGORY = makeCategory({ seq: 1 });

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
});

describe('useTodoGroups · useTodoGroup (R7)', () => {
  it('추가한 투두가 그 카테고리 그룹의 미완료 블록에 나타난다', async () => {
    const { result } = renderHook(() => ({
      groups: useTodoGroups([CATEGORY]),
      group: useTodoGroup(FIXTURE_CATEGORY_ID),
      actions: useTodoActions(),
    }));

    await act(async () => {
      await result.current.actions.loadDate(FIXTURE_DATE);
      await result.current.actions.addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '장보기' });
    });

    expect(result.current.groups).toHaveLength(1);
    expect(result.current.group.incomplete.map((todo) => todo.title)).toEqual(['장보기']);
    expect(result.current.group.counts).toEqual({ done: 0, total: 1 });
  });

  it('그룹은 인자로 받은 `categories` 의 R15 순서로 나온다', async () => {
    // 인자를 뒤집어 넘긴다 — 훅이 `categories` 를 버리면 투두가 있는 그룹 하나만 남아 순서가 깨진다.
    const second = makeCategory({ seq: 2, order: 1 });
    const { result } = renderHook(() => ({
      groups: useTodoGroups([second, CATEGORY]),
      actions: useTodoActions(),
    }));

    await act(async () => {
      await result.current.actions.loadDate(FIXTURE_DATE);
      await result.current.actions.addTodo({ categoryId: second.id, title: '둘째 그룹 것' });
    });

    expect(result.current.groups.map((group) => group.categoryId)).toEqual([
      CATEGORY.id,
      second.id,
    ]);
  });

  it('완료하면 미완료 블록에서 빠져 완료 블록으로 내려간다', async () => {
    const { result } = renderHook(() => ({
      group: useTodoGroup(FIXTURE_CATEGORY_ID),
      actions: useTodoActions(),
    }));

    await act(async () => {
      await result.current.actions.loadDate(FIXTURE_DATE);
      await result.current.actions.addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '물 마시기' });
      await result.current.actions.addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '방 청소' });
    });
    const target = result.current.group.incomplete[0];
    await act(async () => {
      await result.current.actions.toggleDone(target.id, true);
    });

    expect(result.current.group.incomplete.map((todo) => todo.title)).toEqual(['방 청소']);
    expect(result.current.group.completed.map((todo) => todo.title)).toEqual(['물 마시기']);
  });
});
