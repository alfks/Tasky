// 타이머 스토어의 **상태 모양과 순수 변환** — React·zustand·레포지토리를 모르는 부분만 모았다.
// 액션은 `timer-actions.ts`, 저장 배선은 `timer-writes.ts`, 화면용 파생 값은 `timer-selectors.ts`.
//
// 핵심 불변식(timer R2·R3): **실행 중 상태의 원천은 `session` 레코드와 `now` 두 값뿐이다.**
// 남은 시간을 상태로 들고 1초마다 빼지 않는다 — 그러면 백그라운드 탭에서 인터벌이 지연될 때
// 값이 어긋난다. `now` 는 실제 시계를 그대로 담는 창(window)이고, 경과는 매번 다시 계산된다.
import { DomainError } from '@/domain/errors';
import type { FocusSession } from '@/domain/focus/focus-session';
import type { TodoId } from '@/domain/ids';

import type {
  PomodoroBreak,
  PomodoroBreakDone,
  PomodoroCycle,
} from '@/features/timer/store/pomodoro';
import type { TimerPrefs } from '@/features/timer/store/timer-prefs';
import { DEFAULT_TIMER_PREFS } from '@/features/timer/store/timer-prefs';

/** 화면이 보는 단계. `session` 과 그 `status` 에서 나오는 파생 값이다. */
export type TimerPhase = 'idle' | 'running' | 'paused';

/** 완료 카드 (R9 (a)). `signal` 이 차임·탭 제목까지 줄지(R9) 카드만 줄지(R9-a) 가른다. */
export type TimerCompletion = {
  readonly session: FocusSession;
  readonly signal: 'full' | 'record-only';
  /** 시작 시점에 붙잡아 둔 투두 제목. 투두가 그 사이 삭제됐어도 카드 문구가 비지 않는다. */
  readonly todoTitle: string | null;
  /** 이 세션이 투두에 더한 초(R8). 카드 문구의 "N분을 기록했어요". */
  readonly recordedSeconds: number;
};

/** 일시정지 24시간 자동 취소 정리 카드 (R6). 소리도 탭 제목도 주지 않는다. */
export type TimerNotice = {
  readonly todoTitle: string | null;
  readonly recordedSeconds: number;
};

export type TimerState = {
  /** `running` 또는 `paused` 세션 하나. 끝나면 즉시 `null` 이 된다 (R5: 동시에 1개). */
  session: FocusSession | null;
  /** `session.todoId` 의 제목 스냅샷. 투두가 삭제돼도 카드·칩 문구가 유지된다. */
  todoTitle: string | null;
  /**
   * 화면의 세션을 아직 저장소에 적지 못했는가 (timer §2 에러: "타이머는 화면에서 계속 돌고 … 종료 시 재시도").
   * 참이면 저장소를 다시 읽어도 화면의 세션을 내리지 않는다 — 저장이 실패했을 뿐 세션은 진짜다.
   */
  sessionUnsaved: boolean;
  /** 표시 기준 시각(ISO UTC). 1초 인터벌·`visibilitychange`·앱 시작이 갱신한다. */
  now: string;
  /** 다음에 시작할 길이(분) — R1 의 "마지막 사용 길이". */
  minutes: number;
  /** 완료 차임 끄기 (R9). */
  soundOff: boolean;
  /** 뽀모도로 모드 (P1). 꺼져 있으면 지금까지의 단일 집중 세션 그대로다. */
  pomodoro: boolean;
  /**
   * 진행 중인 휴식 (P2·P3). `session` 과 **동시에 존재하지 않는다** — 집중과 휴식은 한 번에 하나다.
   * 저장소 레코드가 아니라 기기별 값이다(`pomodoro.ts` 머리말).
   */
  breakSession: PomodoroBreak | null;
  /** 끝난 휴식 카드 (P4). */
  breakDone: PomodoroBreakDone | null;
  /** 오늘 끝낸 뽀모도로 수 (P5). 다른 날짜의 기록이면 화면에서 0 으로 읽힌다. */
  cycle: PomodoroCycle | null;
  /** 대기 화면에서 고른 투두. `null` 은 "할 일 없이 집중". */
  selectedTodoId: TodoId | null;
  completion: TimerCompletion | null;
  notice: TimerNotice | null;
  /** 사용자에게 그대로 보여줄 한국어 문구. 성공한 액션이 `null` 로 지운다. */
  error: string | null;
  /** `hydrate()` 가 저장소·설정을 한 번 읽었는가. 첫 페인트의 깜빡임을 줄이는 데 쓴다. */
  hydrated: boolean;
};

/** 세션 저장 실패 공통 문구 (timer §2 에러). 원인이 아니라 결과를 말한다. */
export const TIMER_SAVE_FAILED = '기록을 저장하지 못했어요';

/** 도메인 규칙 위반은 그 문구를 그대로, 그 밖의 실패는 공통 문구를 쓴다. */
export function timerMessageOf(error: unknown): string {
  return error instanceof DomainError ? error.message : TIMER_SAVE_FAILED;
}

/**
 * 아직 아무것도 읽지 않은 상태. `now` 는 빈 문자열이 아니라 **주입된 시계의 첫 값**이어야 하므로
 * 스토어 팩토리가 채운다 — 여기서 `Date.now()` 를 부르면 프리렌더 시점에 시각이 굳는다.
 */
export function initialTimerState(
  now: string,
  prefs: TimerPrefs = DEFAULT_TIMER_PREFS,
): TimerState {
  return {
    session: null,
    todoTitle: null,
    sessionUnsaved: false,
    now,
    minutes: prefs.minutes,
    soundOff: prefs.soundOff,
    pomodoro: prefs.pomodoro,
    breakSession: null,
    breakDone: null,
    cycle: null,
    selectedTodoId: null,
    completion: null,
    notice: null,
    error: null,
    hydrated: false,
  };
}

/** 상태에서 단계만. 세션이 없으면 대기다 — 완료 카드가 떠 있어도 타이머 자체는 대기 상태다. */
export function timerPhaseOf(session: FocusSession | null): TimerPhase {
  if (session === null) {
    return 'idle';
  }
  return session.status === 'paused' ? 'paused' : 'running';
}
