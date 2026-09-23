'use client';

// 타이머 명령 등록 (shortcuts R7 "타이머 시작(할 일 선택)·일시정지/재개·중지"). 의존을 뒤집어
// `timer → command` 한 방향으로만 두는 이유는 `todo/hooks/useTodoCommands.ts` 머리 주석과 같다.
// T-19 가 실제로 `command → timer` 를 넣었다가 `timer → todo → command` 로 터진 그 자리다.
//
// **거는 곳은 `TimerChip` 한 군데다.** 헤더에 항상 마운트되고(대기 중에는 아무것도 그리지 않을 뿐),
// 패널(`TimerPanelSection`)은 보여줄 것이 있을 때만 산다(사용자 결정, `selectTimerPanelVisible`) —
// 패널에 걸면 대기 중에는 명령이 사라진다. `useTimerRuntime` 에 걸지 않는 이유는 그 훅이 참조 수
// 방식이라 칩·패널·셸 셋에서 불리고, 그러면 같은 id 가 세 번 등록돼 개발 모드에서 던진다.
//
// 실행의 결과는 화면에 보인다 — 세션이 생기면 헤더 칩(`⏱ 24:59`)이 나타나고 중지하면 사라진다.
//
// **뽀모도로·소리·길이 프리셋(`PRESET_COMMANDS`)도 여기서 등록한다** — 대기 화면(`TimerSetup`)이
// 메인 화면에서 사라지면서(사용자 결정) 그 화면 안의 사전 설정이 접근할 곳을 잃어, 팔레트가
// 유일한 통로가 됐다.
import { useEffect } from 'react';

import { useCommandStore, type Command } from '@/features/command';
import { selectTimerPhase } from '@/features/timer/store/timer-selectors';
import type { TimerPhase } from '@/features/timer/store/timer-state';
import { useTimerStore } from '@/features/timer/store/timer-store';

function phase(): TimerPhase {
  return selectTimerPhase(useTimerStore.getState());
}

/**
 * 뽀모도로·소리·길이 프리셋 여섯 개(사용자 결정 — 대기 화면(`TimerSetup`)이 메인 화면에서
 * 사라지면서, 그 화면 안에 있던 사전 설정도 팔레트로만 남는다). 각 쌍은 지금 값과 **반대쪽만**
 * 보여 `when` 이 곧 지금 값을 말해 준다(대기/실행/일시정지/중지 넷이 서로 다른 국면에서만 보이는
 * 것과 같은 어법). 시작 전에만 뜻이 있는 것이 아니라 실행 중에도 다음 시작을 위해 바꿀 수 있다 —
 * `setMinutes`·`setSoundOff`·`setPomodoro` 자체가 지금 도는 세션에 영향을 주지 않는 "다음 값"
 * 이라서다(timer R1).
 */
const PRESET_COMMANDS: readonly Command[] = [
  {
    id: 'timer.pomodoro.on',
    label: '뽀모도로 켜기',
    keywords: ['휴식', 'pomodoro'],
    when: () => !useTimerStore.getState().pomodoro,
    run: () => {
      useTimerStore.getState().setPomodoro(true);
    },
  },
  {
    id: 'timer.pomodoro.off',
    label: '뽀모도로 끄기',
    keywords: ['휴식', 'pomodoro'],
    when: () => useTimerStore.getState().pomodoro,
    run: () => {
      useTimerStore.getState().setPomodoro(false);
    },
  },
  {
    id: 'timer.sound.on',
    label: '완료 소리 켜기',
    keywords: ['알림', 'sound'],
    when: () => useTimerStore.getState().soundOff,
    run: () => {
      useTimerStore.getState().setSoundOff(false);
    },
  },
  {
    id: 'timer.sound.off',
    label: '완료 소리 끄기',
    keywords: ['무음', 'sound'],
    when: () => !useTimerStore.getState().soundOff,
    run: () => {
      useTimerStore.getState().setSoundOff(true);
    },
  },
  {
    id: 'timer.minutes.25',
    label: '집중 길이 25분',
    when: () => useTimerStore.getState().minutes !== 25,
    run: () => {
      useTimerStore.getState().setMinutes(25);
    },
  },
  {
    id: 'timer.minutes.50',
    label: '집중 길이 50분',
    when: () => useTimerStore.getState().minutes !== 50,
    run: () => {
      useTimerStore.getState().setMinutes(50);
    },
  },
];

/**
 * 지금 할 수 없는 전이는 팔레트에 내지 않는다(`when`) — 대기 중에 "일시정지" 를 고르면 스토어가
 * 조용히 `false` 를 돌려주고 화면은 그대로다. 보이는 것이 곧 실행되는 것이어야 한다.
 *
 * 키워드에는 **라벨에 없는 말만** 싣는다 — `타이머`·`시작` 처럼 라벨에 있는 말은 부분 일치로 이미
 * 걸리고(R8), 두 벌로 두면 한쪽을 지워도 검색이 통과해 테스트가 지켜 주지 못한다.
 *
 * 시작은 **지금 패널에서 고른 할 일과 길이**를 쓴다(`start()` 는 인자가 없으면 스토어의
 * `selectedTodoId`·`minutes` 를 읽는다 — timer R1·R5). 팔레트가 할 일을 다시 고르게 하지 않는다.
 */
export const TIMER_COMMANDS: readonly Command[] = [
  {
    id: 'timer.start',
    label: '타이머 시작',
    keywords: ['집중', 'timer', 'start', 'focus'],
    when: () => phase() === 'idle',
    run: async () => {
      await useTimerStore.getState().start();
    },
  },
  {
    id: 'timer.pause',
    label: '타이머 일시정지',
    keywords: ['멈춤', 'timer', 'pause'],
    when: () => phase() === 'running',
    run: async () => {
      await useTimerStore.getState().pause();
    },
  },
  {
    id: 'timer.resume',
    label: '타이머 재개',
    keywords: ['계속', 'timer', 'resume'],
    when: () => phase() === 'paused',
    run: async () => {
      await useTimerStore.getState().resume();
    },
  },
  {
    id: 'timer.stop',
    label: '타이머 중지',
    keywords: ['그만', 'timer', 'stop'],
    when: () => phase() !== 'idle',
    run: async () => {
      await useTimerStore.getState().stop();
    },
  },
  ...PRESET_COMMANDS,
];

/** `TimerChip` 이 한 번 부른다. 칩이 사라지면(= 헤더가 없는 화면) 명령도 사라진다. */
export function useTimerCommands(): void {
  useEffect(() => useCommandStore.getState().registerCommands(TIMER_COMMANDS), []);
}
