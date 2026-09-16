// 헤더 칩 (timer R11). 대기 중에는 없고, 실행·일시정지 중에는 저장소의 세션을 그대로 이어 보여 준다.
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { FocusSession } from '@/domain/focus/focus-session';
import { adopt } from '@/domain/meta';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { TimerChip } from '@/features/timer/components/TimerChip';
import { resetTimerRuntime } from '@/features/timer/hooks/useTimerRuntime';
import { initialTimerState } from '@/features/timer/store/timer-state';
import { useTimerStore } from '@/features/timer/store/timer-store';
import { makeFocusSession } from '@/test/fixtures/focus-session';
import { makeTodo } from '@/test/fixtures/todo';

import { todayKey } from '@/lib/date';

const START = '2026-09-16T09:00:00.000Z';
const at = (seconds: number): string => new Date(Date.parse(START) + seconds * 1000).toISOString();

/** 저장소에 세션을 심고 시계를 `seconds` 로 옮긴다 — "이 탭을 방금 열었다" 와 같은 상황이다. */
async function seed(session: FocusSession, seconds: number): Promise<void> {
  await getRepositories().focusSessions.upsert(adopt(session));
  vi.setSystemTime(new Date(Date.parse(at(seconds))));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date(START));
  localStorage.clear();
  setRepositories(createMemoryRepositories());
  resetTimerRuntime();
  useTimerStore.setState(initialTimerState(START));
});

afterEach(() => {
  resetTimerRuntime();
  vi.useRealTimers();
});

describe('TimerChip', () => {
  it('대기 중에는 아무것도 렌더하지 않는다', () => {
    const { container } = render(<TimerChip onOpen={() => {}} />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('남은 시간과 할 일을 접근 이름으로 전달하고 누르면 패널을 연다', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const todo = makeTodo({ date: todayKey(), title: '장보기' });
    await getRepositories().todos.upsert(adopt(todo));
    await seed(makeFocusSession({ startedAt: START, plannedSeconds: 1500, todoId: todo.id }), 378);

    render(<TimerChip onOpen={onOpen} />);
    const chip = await screen.findByRole('button', {
      name: '집중 타이머 18분 42초 남음, 장보기',
    });
    expect(chip).toHaveTextContent('18:42');

    await user.click(chip);
    expect(onOpen).toHaveBeenCalledTimes(1);
  });

  it('일시정지 중에도 보이고 그 사실을 이름에 담는다', async () => {
    await seed(makeFocusSession({ startedAt: START, status: 'paused', pausedAt: at(378) }), 3000);

    render(<TimerChip onOpen={() => {}} />);
    expect(
      await screen.findByRole('button', { name: '집중 타이머 18분 42초 남음, 일시정지됨' }),
    ).toBeInTheDocument();
  });
});
