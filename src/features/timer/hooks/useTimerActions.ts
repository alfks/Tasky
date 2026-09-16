'use client';

// 액션 묶음 훅. 액션은 스토어 생성 시 한 번 만들어지고 바뀌지 않는다 — T-19(커맨드 팔레트)의 진입점이다.
import { useShallow } from 'zustand/react/shallow';

import { selectTimerPhase } from '@/features/timer/store/timer-selectors';
import type { TimerPhase } from '@/features/timer/store/timer-state';
import {
  useTimerStore,
  type TimerActions,
  type TimerStore,
} from '@/features/timer/store/timer-store';

/** 매 렌더 새 객체를 만들지만 필드가 전부 같은 참조라 `useShallow` 가 리렌더를 막는다. */
const selectActions = (state: TimerStore): TimerActions => ({
  hydrate: state.hydrate,
  refresh: state.refresh,
  tick: state.tick,
  setMinutes: state.setMinutes,
  setSoundOff: state.setSoundOff,
  selectTodo: state.selectTodo,
  start: state.start,
  pause: state.pause,
  resume: state.resume,
  stop: state.stop,
  extend: state.extend,
  dismissCompletion: state.dismissCompletion,
  dismissNotice: state.dismissNotice,
  clearError: state.clearError,
});

/** 액션 전부. 하나만 쓰는 곳은 `useTimerStore((s) => s.stop)` 처럼 그 조각만 구독하는 편이 싸다. */
export function useTimerActions(): TimerActions {
  return useTimerStore(useShallow(selectActions));
}

/** 명령의 활성 조건(시작은 `idle`, 일시정지는 `running`, 재개는 `paused`)을 판단할 때 쓴다. */
export function useTimerPhase(): TimerPhase {
  return useTimerStore(selectTimerPhase);
}
