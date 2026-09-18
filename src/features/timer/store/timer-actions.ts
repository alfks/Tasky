// 타이머 스토어의 액션 (timer.md R1·R2·R5~R7·R9·R10). 시간 이상(백그라운드·절전·시계 변경)을 다루는
// 부분은 `timer-sync.ts`, 저장 배선은 `timer-writes.ts`, 상태 모양은 `timer-state.ts`.
import {
  pauseFocusSession,
  resumeFocusSession,
  validateFocusMinutes,
} from '@/domain/focus/focus-session.rules';
import type { TodoId } from '@/domain/ids';

import { savePomodoro } from '@/features/timer/store/pomodoro-flow';
import { saveTimerPrefs } from '@/features/timer/store/timer-prefs';
import { createStartAction } from '@/features/timer/store/timer-start';
import { timerMessageOf } from '@/features/timer/store/timer-state';
import {
  endSession,
  hydrateTimer,
  syncActiveSession,
  tickNow,
  type TimerContext,
} from '@/features/timer/store/timer-sync';
import { persistSession } from '@/features/timer/store/timer-writes';

/** `[5분 더]` 의 길이 (timer R10). */
export const FOCUS_EXTEND_MINUTES = 5;

/** 시작 요청. 아무것도 주지 않으면 패널에서 고른 길이·투두를 쓴다. */
export type TimerStartInput = {
  minutes?: number;
  /** `null` 은 "할 일 없이 집중". 생략하면 패널에서 고른 값. */
  todoId?: TodoId | null;
  /** 이 길이를 "마지막 사용 길이"(R1)로 기억할지. `[5분 더]` 는 기억하지 않는다. */
  remember?: boolean;
};

export type TimerActions = {
  /** 앱 시작: 기기 설정 + 저장소의 진행 중 세션을 읽어 이어 붙인다 (R1·R2·R4·R6). */
  hydrate: () => Promise<void>;
  /** 저장소와 다시 맞춘다 (R5 다른 탭, `visibilitychange`). */
  refresh: () => Promise<void>;
  /** 1초 표시 갱신 + 완료 판정 (R3·R4). 남은 시간을 빼지 않는다. */
  tick: () => void;
  /** 길이 선택 (R1). 1~180 정수가 아니면 문구만 남기고 바꾸지 않는다. */
  setMinutes: (minutes: number) => void;
  /** 완료 차임 끄기 (R9). */
  setSoundOff: (soundOff: boolean) => void;
  /** 뽀모도로 모드 켜기/끄기 (P1). 끄면 진행 중인 휴식도 함께 걷는다. */
  setPomodoro: (pomodoro: boolean) => void;
  /** 대기 화면의 투두 선택. `null` 은 "할 일 없이 집중". */
  selectTodo: (todoId: TodoId | null) => void;
  /** 시작 (R2·R5). 저장소에 활성 세션이 있으면 거부하고 그 세션을 보여 준다. */
  start: (input?: TimerStartInput) => Promise<boolean>;
  pause: () => Promise<boolean>;
  resume: () => Promise<boolean>;
  /** 중지 (R7). 확인 대화상자 없음 — 경과가 기록되므로 파괴적이지 않다. */
  stop: () => Promise<boolean>;
  /** `[5분 더]` (R10). 같은 투두로 5분 세션을 새로 시작한다. */
  extend: () => Promise<boolean>;
  /** 휴식 건너뛰기 (P3). 사용자가 누른 것이라 끝난 휴식 카드를 띄우지 않는다. */
  skipBreak: () => void;
  dismissCompletion: () => void;
  dismissNotice: () => void;
  dismissBreakDone: () => void;
  clearError: () => void;
};

/** 대기 화면의 설정 액션 4개. */
function createSettingActions(
  ctx: TimerContext,
): Pick<TimerActions, 'setMinutes' | 'setSoundOff' | 'setPomodoro' | 'selectTodo'> {
  return {
    setMinutes: (minutes) => {
      try {
        validateFocusMinutes(minutes);
      } catch (error) {
        ctx.set({ error: timerMessageOf(error) });
        return;
      }
      ctx.set({ minutes, error: null });
      saveTimerPrefs(ctx.get());
    },
    setSoundOff: (soundOff) => {
      ctx.set({ soundOff });
      saveTimerPrefs(ctx.get());
    },
    setPomodoro: (pomodoro) => {
      // 모드를 끄면 진행 중인 휴식은 의미가 없다 — 남겨 두면 뽀모도로를 껐는데 휴식 화면이
      // 계속 떠 있는 상태가 된다. 끝난 휴식 카드도 같이 걷는다.
      ctx.set(pomodoro ? { pomodoro } : { pomodoro, breakSession: null, breakDone: null });
      saveTimerPrefs(ctx.get());
      savePomodoro(ctx.get());
    },
    selectTodo: (todoId) => {
      ctx.set({ selectedTodoId: todoId });
    },
  };
}

/** 일시정지·재개 (R6). 둘 다 세션 한 건만 쓴다. */
function createPauseActions(ctx: TimerContext): Pick<TimerActions, 'pause' | 'resume'> {
  const transition = (rule: typeof pauseFocusSession): Promise<boolean> =>
    ctx.serialize(() => transitionNow(ctx, rule));

  return {
    pause: () => transition(pauseFocusSession),
    resume: () => transition(resumeFocusSession),
  };
}

/** 큐 차례가 왔을 때의 실제 전이. */
async function transitionNow(ctx: TimerContext, rule: typeof pauseFocusSession): Promise<boolean> {
  const session = ctx.get().session;
  if (session === null) {
    return false;
  }
  let next;
  try {
    next = rule(session, ctx.deps);
  } catch (error) {
    ctx.set({ error: timerMessageOf(error) });
    return false;
  }
  ctx.set({ session: next, now: ctx.deps.now(), sessionUnsaved: true, error: null });
  try {
    await persistSession(next);
    ctx.set({ sessionUnsaved: false });
    return true;
  } catch (error) {
    ctx.set({ error: timerMessageOf(error) });
    return false;
  }
}

/** 액션 전부. 스토어는 이 결과를 상태에 펼쳐 넣기만 한다. */
export function createTimerActions(ctx: TimerContext): TimerActions {
  const actions: TimerActions = {
    hydrate: () => hydrateTimer(ctx),
    refresh: () => syncActiveSession(ctx),
    tick: () => {
      tickNow(ctx);
    },
    ...createSettingActions(ctx),
    ...createStartAction(ctx),
    ...createPauseActions(ctx),
    stop: () => {
      const session = ctx.get().session;
      return session === null ? Promise.resolve(false) : endSession(ctx, session, 'stop');
    },
    extend: () => {
      const completion = ctx.get().completion;
      if (completion === null) {
        return Promise.resolve(false);
      }
      ctx.set({ completion: null });
      return actions.start({
        minutes: FOCUS_EXTEND_MINUTES,
        todoId: completion.session.todoId ?? null,
        remember: false,
      });
    },
    skipBreak: () => {
      if (ctx.get().breakSession === null) {
        return;
      }
      ctx.set({ breakSession: null, breakDone: null });
      savePomodoro(ctx.get());
    },
    dismissCompletion: () => {
      ctx.set({ completion: null });
    },
    dismissNotice: () => {
      ctx.set({ notice: null });
    },
    dismissBreakDone: () => {
      ctx.set({ breakDone: null });
    },
    clearError: () => {
      ctx.set({ error: null });
    },
  };
  return actions;
}
