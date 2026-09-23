// 투두 항목 메뉴 "타이머 시작" 배선 — 두 feature 를 잇는 다리는 셸의 것이다(timer.md §2).
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { adopt } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { useStartTimerForTodo } from '@/features/shell/hooks/useStartTimerForTodo';
import { initialTimerState } from '@/features/timer/store/timer-state';
import { useTimerStore } from '@/features/timer/store/timer-store';
import { useTodoStore } from '@/features/todo';
import { FIXTURE_DATE } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

const TODO = makeTodo({ seq: 1, title: '장보기' });

let start: (todo: Todo) => void;

function Probe() {
  start = useStartTimerForTodo();
  return null;
}

beforeEach(async () => {
  setRepositories(createMemoryRepositories());
  useTimerStore.setState(initialTimerState(new Date().toISOString()));
  await getRepositories().todos.upsert(adopt(TODO));
  await useTodoStore.getState().loadDate(FIXTURE_DATE);
});

describe('useStartTimerForTodo', () => {
  it('그 투두로 마지막에 쓴 길이만큼 집중 세션을 바로 시작한다 — 길이 화면을 열지 않는다', async () => {
    render(<Probe />);
    await act(async () => {
      start(TODO);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    const state = useTimerStore.getState();
    expect(state.session?.todoId).toBe(TODO.id);
    expect(state.session?.status).toBe('running');
    expect(state.todoTitle).toBe('장보기');
  });

  it('이미 다른 세션이 돌고 있으면 시작을 거부하고 그 세션을 그대로 보여 준다(timer R5)', async () => {
    render(<Probe />);
    await act(async () => {
      await useTimerStore.getState().start({ todoId: null });
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    const active = useTimerStore.getState().session;

    await act(async () => {
      start(TODO);
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(useTimerStore.getState().session?.id).toBe(active?.id);
  });
});
