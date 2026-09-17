// 타이머 명령 등록 (shortcuts R7 "타이머 시작(할 일 선택)·일시정지/재개·중지").
//
// 팔레트에 뜨는지만 재면 `run` 이 빈 함수여도 통과한다 — 그래서 `runCommand` 로 **세션이 실제로
// 생기고, 멈추고, 다시 돌고, 사라지는 것**까지 본다. `when` 은 네 명령이 서로 다른 국면에서만
// 보이는지로 잰다(대기 중의 "일시정지" 는 눌러도 스토어가 조용히 false 를 준다).
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { availableCommands, matchCommands, useCommandStore } from '@/features/command';
import { TimerChip } from '@/features/timer/components/TimerChip';
import { resetTimerRuntime } from '@/features/timer/hooks/useTimerRuntime';
import { selectTimerPhase } from '@/features/timer/store/timer-selectors';
import { initialTimerState } from '@/features/timer/store/timer-state';
import { useTimerStore } from '@/features/timer/store/timer-store';
import { FIXTURE_INSTANT } from '@/test/fixtures/deps';

function commandIds(): string[] {
  return useCommandStore.getState().commands.map((command) => command.id);
}

/** 지금 팔레트에 **보이는** 명령만 (`when` 통과분). */
function visibleIds(): string[] {
  return availableCommands(useCommandStore.getState().commands).map((command) => command.id);
}

function phase(): string {
  return selectTimerPhase(useTimerStore.getState());
}

beforeEach(() => {
  resetTimerRuntime();
  setRepositories(createMemoryRepositories());
  useCommandStore.setState({ commands: [], recentCommandIds: [] });
  useTimerStore.setState(initialTimerState(FIXTURE_INSTANT));
});

describe('TimerChip 이 등록한다 (R7)', () => {
  it('네 명령을 이름과 함께 올린다', async () => {
    render(<TimerChip onOpen={() => {}} />);

    await waitFor(() =>
      expect(commandIds()).toEqual(['timer.start', 'timer.pause', 'timer.resume', 'timer.stop']),
    );
    expect(useCommandStore.getState().commands.map((command) => command.label)).toEqual([
      '타이머 시작',
      '타이머 일시정지',
      '타이머 재개',
      '타이머 중지',
    ]);
  });

  it('한글 `타이머` 로 넷이 다 찾힌다 (R8 — 라벨 부분 일치)', async () => {
    render(<TimerChip onOpen={() => {}} />);
    await waitFor(() => expect(commandIds()).toHaveLength(4));

    expect(matchCommands(useCommandStore.getState().commands, '타이머')).toHaveLength(4);
  });

  it('라벨에 없는 말로도 찾힌다 — 키워드가 거기 쓰인다', async () => {
    render(<TimerChip onOpen={() => {}} />);
    await waitFor(() => expect(commandIds()).toHaveLength(4));
    const all = useCommandStore.getState().commands;

    expect(matchCommands(all, '집중').map((command) => command.id)).toEqual(['timer.start']);
    expect(matchCommands(all, '그만').map((command) => command.id)).toEqual(['timer.stop']);
    expect(matchCommands(all, '멈춤').map((command) => command.id)).toEqual(['timer.pause']);
    expect(matchCommands(all, '계속').map((command) => command.id)).toEqual(['timer.resume']);
  });

  it('대기 중에는 `시작` 만 보인다 (when)', async () => {
    render(<TimerChip onOpen={() => {}} />);
    await waitFor(() => expect(commandIds()).toHaveLength(4));

    expect(visibleIds()).toEqual(['timer.start']);
  });

  it('시작 → 일시정지 → 재개 → 중지가 **실제로** 동작하고 보이는 명령도 따라 바뀐다', async () => {
    render(<TimerChip onOpen={() => {}} />);
    await waitFor(() => expect(commandIds()).toHaveLength(4));

    await useCommandStore.getState().runCommand('timer.start');
    expect(phase()).toBe('running');
    expect(visibleIds()).toEqual(['timer.pause', 'timer.stop']);
    // 세션이 생기면 헤더 칩이 나타난다 — 사용자가 보는 피드백이 이것이다(R11).
    await waitFor(() => expect(screen.getByRole('button')).toBeInTheDocument());

    await useCommandStore.getState().runCommand('timer.pause');
    expect(phase()).toBe('paused');
    expect(visibleIds()).toEqual(['timer.resume', 'timer.stop']);

    await useCommandStore.getState().runCommand('timer.resume');
    expect(phase()).toBe('running');

    await useCommandStore.getState().runCommand('timer.stop');
    expect(phase()).toBe('idle');
    expect(visibleIds()).toEqual(['timer.start']);
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());
  });

  it('칩이 사라지면 명령도 사라진다', async () => {
    const view = render(<TimerChip onOpen={() => {}} />);
    await waitFor(() => expect(commandIds()).toHaveLength(4));

    view.unmount();

    expect(commandIds()).toEqual([]);
  });
});
