// 뽀모도로 규칙 (timer.md P1~P7). **순수 함수뿐**이다 — React·저장소·실제 시계를 모르고,
// 시각은 전부 주입된 `now` 로 계산한다(R3 와 같은 방식). 그래서 백그라운드 탭에서 인터벌이
// 지연돼도 휴식의 남은 시간이 어긋나지 않는다.
//
// **왜 휴식은 `FocusSession` 레코드가 아닌가**: 세션 레코드는 "집중한 시간"의 원천이고 끝날 때
// `Todo.focusSeconds` 에 더해진다(R8). 휴식을 같은 표에 적으면 쉰 시간이 집중 시간으로 새거나,
// 그것을 막으려고 레코드에 구분 필드를 넣어야 한다 — 후자는 저장소 스키마 변경이라 ADR 이 필요하다
// (CLAUDE.md §7-9). 휴식은 **기록할 가치가 있는 사실이 아니라 진행 중인 안내**라서 기기별 상태로 둔다
// (`pomodoro-state.ts`).
import { diffSeconds } from '@/domain/date/instant';
import {
  FOCUS_FRESH_COMPLETION_SECONDS,
  FOCUS_MIN_MINUTES,
} from '@/domain/focus/focus-session.rules';

/** 긴 휴식 주기 (P2): 4번째 집중을 끝냈을 때. */
export const POMODORO_LONG_BREAK_EVERY = 4;

/**
 * 휴식 길이의 상한(분) (P1). 집중 길이가 180분까지 가능하므로(R1) 비율만 쓰면 108분짜리 "휴식"이
 * 나온다 — 그건 휴식이 아니라 다른 일과다. 60분에서 자른다.
 */
export const POMODORO_MAX_BREAK_MINUTES = 60;

export type PomodoroBreakKind = 'short' | 'long';

/**
 * 진행 중인 휴식. `startedAt` + `plannedSeconds` 두 값이 전부이고 남은 시간은 매번 다시 계산된다
 * (R3 와 같은 이유 — 틱을 누적하지 않는다).
 */
export type PomodoroBreak = {
  readonly kind: PomodoroBreakKind;
  /** 휴식이 시작된 시각(ISO UTC). */
  readonly startedAt: string;
  readonly plannedSeconds: number;
};

/**
 * 끝난 휴식 카드 (P4). **막 끝난 휴식에만 뜬다** — 등급을 나누지 않는 이유는 아래 `pomodoroBreakSignal`.
 */
export type PomodoroBreakDone = {
  readonly kind: PomodoroBreakKind;
};

/** 하루치 사이클 기록 (P5). 날짜가 바뀌면 통째로 갈린다. */
export type PomodoroCycle = {
  /** `DateKey`(YYYY-MM-DD). 이 날짜의 집계라는 뜻이다. */
  readonly date: string;
  readonly completed: number;
};

const SECONDS_PER_MINUTE = 60;

function clampBreakMinutes(minutes: number): number {
  return Math.min(POMODORO_MAX_BREAK_MINUTES, Math.max(FOCUS_MIN_MINUTES, Math.round(minutes)));
}

/**
 * 짧은 휴식 길이 (P1). 집중 길이의 **1/5** — 고전형 25분에서 정확히 5분이 나온다.
 * 사용자가 고른 집중 길이 하나에서 파생시키는 이유는 대기 화면의 언어를 늘리지 않기 위해서다
 * (입력 칸이 셋이 되면 "시간을 정해 주세요" 가 더 이상 한 가지 선택이 아니게 된다).
 */
export function pomodoroShortBreakMinutes(focusMinutes: number): number {
  return clampBreakMinutes(focusMinutes / 5);
}

/** 긴 휴식 길이 (P1). 집중 길이의 **3/5** — 고전형 25분에서 정확히 15분이 나온다. */
export function pomodoroLongBreakMinutes(focusMinutes: number): number {
  return clampBreakMinutes((focusMinutes * 3) / 5);
}

/**
 * `completed` 번째 집중을 막 끝냈을 때 이어질 휴식의 종류 (P2).
 * 4·8·12번째가 긴 휴식이다. 0 이하는 아직 아무것도 끝내지 않은 상태라 짧은 휴식으로 본다.
 */
export function pomodoroBreakKind(completed: number): PomodoroBreakKind {
  return completed > 0 && completed % POMODORO_LONG_BREAK_EVERY === 0 ? 'long' : 'short';
}

/** 그 휴식의 길이(분) (P1·P2). */
export function pomodoroBreakMinutes(focusMinutes: number, completed: number): number {
  return pomodoroBreakKind(completed) === 'long'
    ? pomodoroLongBreakMinutes(focusMinutes)
    : pomodoroShortBreakMinutes(focusMinutes);
}

/** 휴식 하나를 만든다 (P2·P3). */
export function startPomodoroBreak(input: {
  focusMinutes: number;
  completed: number;
  at: string;
}): PomodoroBreak {
  return {
    kind: pomodoroBreakKind(input.completed),
    startedAt: input.at,
    plannedSeconds: pomodoroBreakMinutes(input.focusMinutes, input.completed) * SECONDS_PER_MINUTE,
  };
}

/** 남은 초. 시계가 뒤로 가도 계획 시간을 넘지 않는다. */
export function pomodoroBreakRemainingSeconds(rest: PomodoroBreak, now: string): number {
  const elapsed = Math.max(0, Math.floor(diffSeconds(rest.startedAt, now)));
  return Math.max(0, rest.plannedSeconds - Math.min(rest.plannedSeconds, elapsed));
}

/** 이 시점에 휴식이 끝났는가 (P4). */
export function pomodoroBreakOver(rest: PomodoroBreak, now: string): boolean {
  return pomodoroBreakRemainingSeconds(rest, now) <= 0;
}

/**
 * 끝난 휴식이 줄 신호 등급 (P4). 기준은 완료 신호(R9-a)와 **같은 2분**이다.
 *
 * 다만 결과가 R9-a 와 다르다: 완료는 오래됐어도 카드(a)를 남기지만(`focusSeconds` 가 늘어난 이유를
 * 설명해야 하므로), **휴식은 아무것도 기록하지 않는다.** 설명할 숫자가 없는데 사흘 전 휴식의 카드를
 * 띄우면 닫을 거리만 늘어난다. 그래서 `quiet` 이면 카드도 없이 조용히 대기 화면으로 돌아간다.
 */
export function pomodoroBreakSignal(rest: PomodoroBreak, now: string): 'full' | 'quiet' {
  const over = diffSeconds(rest.startedAt, now) - rest.plannedSeconds;
  return over > FOCUS_FRESH_COMPLETION_SECONDS ? 'quiet' : 'full';
}

/** 그 날짜에 끝낸 뽀모도로 수 (P5). 기록이 다른 날짜의 것이면 0 이다. */
export function pomodoroCountOn(cycle: PomodoroCycle | null, date: string): number {
  return cycle !== null && cycle.date === date ? cycle.completed : 0;
}

/** 뽀모도로 하나를 더한다 (P5). 날짜가 다르면 그 날짜의 첫 개로 갈아 끼운다. */
export function addPomodoro(cycle: PomodoroCycle | null, date: string): PomodoroCycle {
  return { date, completed: pomodoroCountOn(cycle, date) + 1 };
}

/** 화면 문구용 이름. */
export function pomodoroBreakLabel(kind: PomodoroBreakKind): string {
  return kind === 'long' ? '긴 휴식' : '짧은 휴식';
}
