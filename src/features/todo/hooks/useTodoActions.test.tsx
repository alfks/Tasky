// `useTodoActions` — 액션 묶음의 참조가 상태 변경으로 바뀌지 않는지(리렌더 폭증 방지).
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useTodoActions } from '@/features/todo/hooks/useTodoActions';
import { useTodoStore } from '@/features/todo/store/todo-store';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID } from '@/test/fixtures/todo';

beforeEach(() => {
  setRepositories(createMemoryRepositories());
  useTodoStore.setState({ byId: {}, date: null, status: 'idle', error: null });
});

describe('useTodoActions', () => {
  it('상태가 바뀌어도 묶음의 참조는 그대로다', async () => {
    const { result } = renderHook(() => useTodoActions());
    const first = result.current;

    await act(async () => {
      await first.loadDate(FIXTURE_DATE);
      await first.addTodo({ categoryId: FIXTURE_CATEGORY_ID, title: '장보기' });
    });

    expect(result.current).toBe(first);
    expect(Object.values(useTodoStore.getState().byId)).toHaveLength(1);
  });
});
