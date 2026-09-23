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

const PHASE_COMMAND_IDS = ['timer.start', 'timer.pause', 'timer.resume', 'timer.stop'];
const PRESET_COMMAND_IDS = [
  'timer.pomodoro.on',
  'timer.pomodoro.off',
  'timer.sound.on',
  'timer.sound.off',
  'timer.minutes.25',
  'timer.minutes.50',
];

describe('TimerChip 이 등록한다 (R7)', () => {
  it('열 명령을 이름과 함께 올린다', async () => {
    render(<TimerChip onOpen={() => {}} />);

    await waitFor(() =>
      expect(commandIds()).toEqual([...PHASE_COMMAND_IDS, ...PRESET_COMMAND_IDS]),
    );
    expect(useCommandStore.getState().commands.map((command) => command.label)).toEqual([
      '타이머 시작',
      '타이머 일시정지',
      '타이머 재개',
      '타이머 중지',
      '뽀모도로 켜기',
      '뽀모도로 끄기',
      '완료 소리 켜기',
      '완료 소리 끄기',
      '집중 길이 25분',
      '집중 길이 50분',
    ]);
  });

  it('한글 `타이머` 로 네 국면 명령이 다 찾힌다 (R8 — 라벨 부분 일치)', async () => {
    render(<TimerChip onOpen={() => {}} />);
    await waitFor(() => expect(commandIds()).toHaveLength(10));

    expect(matchCommands(useCommandStore.getState().commands, '타이머')).toHaveLength(4);
  });

  it('라벨에 없는 말로도 찾힌다 — 키워드가 거기 쓰인다', async () => {
    render(<TimerChip onOpen={() => {}} />);
    await waitFor(() => expect(commandIds()).toHaveLength(10));
    const all = useCommandStore.getState().commands;

    // "집중 길이 …분" 은 라벨이 "집중" 으로 시작해(score 0) 키워드로만 걸리는 "타이머 시작"
    // (score 2)보다 앞선다(command-registry.ts matchCommands 의 점수 규칙).
    expect(matchCommands(all, '집중').map((command) => command.id)).toEqual([
      'timer.minutes.25',
      'timer.minutes.50',
      'timer.start',
    ]);
    expect(matchCommands(all, '그만').map((command) => command.id)).toEqual(['timer.stop']);
    expect(matchCommands(all, '멈춤').map((command) => command.id)).toEqual(['timer.pause']);
    expect(matchCommands(all, '계속').map((command) => command.id)).toEqual(['timer.resume']);
  });

  it('대기 중에는 `시작` 과 지금 값의 반대쪽 사전 설정만 보인다 (when)', async () => {
    render(<TimerChip onOpen={() => {}} />);
    await waitFor(() => expect(commandIds()).toHaveLength(10));

    // 기본값(집중 25분·소리 켜짐·뽀모도로 꺼짐)의 반대쪽만 뜬다 — 이미 25분이면 "50분으로" 만,
    // 이미 소리가 켜져 있으면 "끄기" 만.
    expect(visibleIds()).toEqual([
      'timer.start',
      'timer.pomodoro.on',
      'timer.sound.off',
      'timer.minutes.50',
    ]);
  });

  it('시작 → 일시정지 → 재개 → 중지가 **실제로** 동작하고 보이는 명령도 따라 바뀐다', async () => {
    render(<TimerChip onOpen={() => {}} />);
    await waitFor(() => expect(commandIds()).toHaveLength(10));

    await useCommandStore.getState().runCommand('timer.start');
    expect(phase()).toBe('running');
    expect(visibleIds()).toEqual([
      'timer.pause',
      'timer.stop',
      'timer.pomodoro.on',
      'timer.sound.off',
      'timer.minutes.50',
    ]);
    // 세션이 생기면 헤더 칩이 나타난다 — 사용자가 보는 피드백이 이것이다(R11).
    await waitFor(() => expect(screen.getByRole('button')).toBeInTheDocument());

    await useCommandStore.getState().runCommand('timer.pause');
    expect(phase()).toBe('paused');

    await useCommandStore.getState().runCommand('timer.resume');
    expect(phase()).toBe('running');

    await useCommandStore.getState().runCommand('timer.stop');
    expect(phase()).toBe('idle');
    expect(visibleIds()).toEqual([
      'timer.start',
      'timer.pomodoro.on',
      'timer.sound.off',
      'timer.minutes.50',
    ]);
    await waitFor(() => expect(screen.queryByRole('button')).not.toBeInTheDocument());
  });

  it('뽀모도로·소리·길이가 실제로 바뀌고 반대쪽 명령으로 넘어간다', async () => {
    render(<TimerChip onOpen={() => {}} />);
    await waitFor(() => expect(commandIds()).toHaveLength(10));

    await useCommandStore.getState().runCommand('timer.pomodoro.on');
    expect(useTimerStore.getState().pomodoro).toBe(true);
    expect(visibleIds()).toContain('timer.pomodoro.off');
    expect(visibleIds()).not.toContain('timer.pomodoro.on');

    await useCommandStore.getState().runCommand('timer.sound.on');
    expect(useTimerStore.getState().soundOff).toBe(false);
    expect(visibleIds()).toContain('timer.sound.off');

    await useCommandStore.getState().runCommand('timer.minutes.50');
    expect(useTimerStore.getState().minutes).toBe(50);
    expect(visibleIds()).toContain('timer.minutes.25');
    expect(visibleIds()).not.toContain('timer.minutes.50');
  });

  it('칩이 사라지면 명령도 사라진다', async () => {
    const view = render(<TimerChip onOpen={() => {}} />);
    await waitFor(() => expect(commandIds()).toHaveLength(10));

    view.unmount();

    expect(commandIds()).toEqual([]);
  });
});
