// 화면용 파생 값 (timer R3·R11, §5). **전부 순수 함수**이고 남은 시간은 상태가 아니라
// `session` + `now` 에서 매번 다시 계산된다 — 그래서 인터벌이 지연돼도 표시가 어긋나지 않는다.
import { focusElapsedSeconds, focusRemainingSeconds } from '@/domain/focus/focus-session.rules';

import { pomodoroBreakLabel, pomodoroBreakRemainingSeconds } from '@/features/timer/store/pomodoro';
import { timerPhaseOf, type TimerPhase, type TimerState } from '@/features/timer/store/timer-state';

/** 선택자가 보는 최소 상태. 스토어 전체를 구독하지 않게 필요한 조각만 요구한다. */
export type TimerSnapshot = Pick<TimerState, 'session' | 'now'>;

/** 휴식 선택자가 보는 최소 상태 (P2). */
export type TimerBreakSnapshot = Pick<TimerState, 'breakSession' | 'now'>;

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3600;

const pad2 = (value: number): string => String(value).padStart(2, '0');

/**
 * 시계 표기 (링·헤더 칩·탭 제목). 1시간 미만은 `M:SS`, 그 이상은 `H:MM:SS`.
 * 최대 길이가 180분(R1)이라 `H` 는 한 자리를 넘지 않는다.
 */
export function formatClock(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / SECONDS_PER_HOUR);
  const minutes = Math.floor((total % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
  const rest = total % SECONDS_PER_MINUTE;
  return hours > 0 ? `${hours}:${pad2(minutes)}:${pad2(rest)}` : `${minutes}:${pad2(rest)}`;
}

/**
 * 낭독용 길이 ("18분 42초"). 시계 표기(`18:42`)를 스크린리더가 시각으로 읽는 사고를 막는다.
 * 0초는 "0초" 가 아니라 "0분" 으로 — 완료 직후의 자연스러운 표현이다.
 */
export function formatSpokenDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / SECONDS_PER_MINUTE);
  const rest = total % SECONDS_PER_MINUTE;
  if (minutes === 0 && rest === 0) {
    return '0분';
  }
  if (rest === 0) {
    return `${minutes}분`;
  }
  return minutes === 0 ? `${rest}초` : `${minutes}분 ${rest}초`;
}

/**
 * 기록된 시간 문구 ("25분을 기록했어요" 의 앞부분). 1분이 안 되는 세션도 기록되므로(R13)
 * "0분" 이라고 쓰지 않고 "1분 미만" 으로 말한다 — 0 이라고 하면 기록이 없는 것처럼 읽힌다.
 */
export function formatRecordedDuration(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  if (total < SECONDS_PER_MINUTE) {
    return '1분 미만';
  }
  return `${Math.floor(total / SECONDS_PER_MINUTE)}분`;
}

/** 지금 단계. */
export function selectTimerPhase(state: Pick<TimerState, 'session'>): TimerPhase {
  return timerPhaseOf(state.session);
}

/** 남은 초. 대기 중이면 0 이다. */
export function selectRemainingSeconds(state: TimerSnapshot): number {
  return state.session === null ? 0 : focusRemainingSeconds(state.session, state.now);
}

/** 지난 초. 대기 중이면 0 이다. */
export function selectElapsedSeconds(state: TimerSnapshot): number {
  return state.session === null ? 0 : focusElapsedSeconds(state.session, state.now);
}

/**
 * 링이 그릴 비율 (남은 비율 — 시간이 갈수록 줄어든다). 대기 중이면 `null` 이라
 * `ProgressRing` 이 트랙만 그린다.
 */
export function selectRingRatio(state: TimerSnapshot): number | null {
  if (state.session === null) {
    return null;
  }
  return selectRemainingSeconds(state) / state.session.plannedSeconds;
}

/** 링·칩에 보이는 시계 문자열. */
export function selectClockText(state: TimerSnapshot): string {
  return formatClock(selectRemainingSeconds(state));
}

/** 휴식의 남은 초 (P2). 휴식 중이 아니면 0 이다. */
export function selectBreakRemainingSeconds(state: TimerBreakSnapshot): number {
  return state.breakSession === null
    ? 0
    : pomodoroBreakRemainingSeconds(state.breakSession, state.now);
}

/** 휴식 링이 그릴 비율. 휴식 중이 아니면 `null`. */
export function selectBreakRingRatio(state: TimerBreakSnapshot): number | null {
  if (state.breakSession === null) {
    return null;
  }
  return selectBreakRemainingSeconds(state) / state.breakSession.plannedSeconds;
}

/** 휴식 링·칩의 시계 문자열. */
export function selectBreakClockText(state: TimerBreakSnapshot): string {
  return formatClock(selectBreakRemainingSeconds(state));
}

/** 휴식 중 헤더 칩의 접근 이름 (P2·§5). 어떤 휴식인지가 남은 시간 뒤에 온다. */
export function selectBreakChipLabel(state: TimerBreakSnapshot): string {
  if (state.breakSession === null) {
    return '';
  }
  const remaining = formatSpokenDuration(selectBreakRemainingSeconds(state));
  return `${pomodoroBreakLabel(state.breakSession.kind)} ${remaining} 남음`;
}

/**
 * 헤더 칩의 접근 이름 (§5). 투두가 있으면 뒤에 붙인다.
 * 일시정지 중이면 그 사실이 먼저 온다 — 멈춘 줄 모르고 기다리는 일이 없게.
 */
export function selectChipLabel(state: TimerSnapshot & { todoTitle: string | null }): string {
  const remaining = formatSpokenDuration(selectRemainingSeconds(state));
  const paused = state.session?.status === 'paused' ? ', 일시정지됨' : '';
  const todo = state.todoTitle === null ? '' : `, ${state.todoTitle}`;
  return `집중 타이머 ${remaining} 남음${paused}${todo}`;
}

/**
 * 실행 중 탭 제목 (R11: `"18:42 · 장보기 · Tasky"`). 대기 중이면 `null` — 그때는
 * 앱 셸이 정한 제목(app-shell R9)이 그대로 남는다.
 */
export function selectDocumentTitle(
  state: TimerSnapshot & TimerBreakSnapshot & { todoTitle: string | null },
  appTitle: string,
): string | null {
  if (state.session !== null && state.session.status === 'running') {
    const todo = state.todoTitle === null ? '' : `${state.todoTitle} · `;
    return `${selectClockText(state)} · ${todo}${appTitle}`;
  }
  // P2: 휴식도 돌고 있는 타이머다. 탭 제목이 대기 상태로 돌아가면 다른 탭에 가 있는 동안
  // 휴식이 흐르는지 알 방법이 사라진다.
  if (state.breakSession !== null) {
    return `${selectBreakClockText(state)} · ${pomodoroBreakLabel(state.breakSession.kind)} · ${appTitle}`;
  }
  return null;
}
