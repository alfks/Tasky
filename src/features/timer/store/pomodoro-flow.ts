// 뽀모도로 **흐름 전이** (timer P3·P4·P5). 스토어를 직접 만지지 않고 "다음 상태 조각"만 돌려준다 —
// 세우는 일은 `timer-sync.ts`·`timer-actions.ts` 가 하고, 여기는 순수 판정만 맡아 단위 테스트가 쉬워진다.
import {
  addPomodoro,
  pomodoroBreakOver,
  pomodoroBreakSignal,
  startPomodoroBreak,
  type PomodoroBreak,
  type PomodoroCycle,
} from '@/features/timer/store/pomodoro';
import { writePomodoroState } from '@/features/timer/store/pomodoro-state';
import type { TimerState } from '@/features/timer/store/timer-state';

const SECONDS_PER_MINUTE = 60;

/** 기기별 상태를 저장한다 (P4·P5). 이 두 조각이 바뀌는 곳마다 부른다. */
export function savePomodoro(state: Pick<TimerState, 'breakSession' | 'cycle'>): void {
  writePomodoroState({ breakSession: state.breakSession, cycle: state.cycle });
}

export type PomodoroAdvance = Pick<TimerState, 'cycle' | 'breakSession'>;

/**
 * 집중 하나가 **완료**됐을 때의 다음 상태 (P3·P5). 뽀모도로 모드가 꺼져 있으면 `null` — 아무것도 바뀌지 않는다.
 *
 * 두 가지를 일부러 다르게 다룬다:
 * - **사이클 수는 신호 등급과 무관하게 는다.** 뒤늦게 알아챘을 뿐 그 집중은 실제로 끝났다.
 *   날짜는 세션이 시작된 날(`date`)로 센다 — 자정을 넘겨 끝난 집중이 다음 날의 첫 개가 되지 않는다.
 * - **휴식은 `signal === 'full'` (끝난 지 2분 이내)일 때만 시작한다.** 이것이 "자리를 비운 사이
 *   사이클이 혼자 돌아간다"는 문제의 답이다: 자리를 비웠다면 이미 쉰 것이고, 그때 5분을 새로 세는 것은
 *   거짓 안내다. 그리고 휴식 다음의 집중은 **언제나 사용자가 눌러야** 시작되므로(P3), 자리를 비운
 *   사이에 진행되는 구간은 최대 하나(휴식)이고 거기서 멈춘다 — 기록이 생기는 방향은 자동이 아니다.
 */
export function pomodoroAfterComplete(
  state: Pick<TimerState, 'pomodoro' | 'cycle'>,
  input: {
    date: string;
    plannedSeconds: number;
    signal: 'full' | 'record-only';
    at: string;
  },
): PomodoroAdvance | null {
  if (!state.pomodoro) {
    return null;
  }
  const cycle: PomodoroCycle = addPomodoro(state.cycle, input.date);
  if (input.signal !== 'full') {
    return { cycle, breakSession: null };
  }
  const breakSession = startPomodoroBreak({
    focusMinutes: Math.max(1, Math.round(input.plannedSeconds / SECONDS_PER_MINUTE)),
    completed: cycle.completed,
    at: input.at,
  });
  return { cycle, breakSession };
}

export type PomodoroSweep = Pick<TimerState, 'breakSession' | 'breakDone'>;

/**
 * 이 시점의 휴식 정리 (P4). 끝났으면 카드로 바꾸고, 아니면 `null`(변화 없음).
 * 틱·재활성화·앱 시작이 모두 이 함수 하나를 부른다 — 갈리면 "탭을 열어 둔 채"와 "닫았다 열었을 때"의
 * 동작이 달라진다(`sweepSession` 과 같은 이유).
 */
export function sweepPomodoroBreak(
  state: Pick<TimerState, 'breakSession'>,
  now: string,
): PomodoroSweep | null {
  const rest: PomodoroBreak | null = state.breakSession;
  if (rest === null || !pomodoroBreakOver(rest, now)) {
    return null;
  }
  const fresh = pomodoroBreakSignal(rest, now) === 'full';
  return { breakSession: null, breakDone: fresh ? { kind: rest.kind } : null };
}
