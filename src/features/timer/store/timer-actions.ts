// 타이머 스토어의 액션 (timer.md R1·R2·R5~R7·R9·R10). 시간 이상(백그라운드·절전·시계 변경)을 다루는
// 부분은 `timer-sync.ts`, 저장 배선은 `timer-writes.ts`, 상태 모양은 `timer-state.ts`.
import type { DateKey } from '@/domain/date/date-key';
import type { FocusSession } from '@/domain/focus/focus-session';
import {
  pauseFocusSession,
  resumeFocusSession,
  startFocusSession,
  validateFocusMinutes,
} from '@/domain/focus/focus-session.rules';
import type { TodoId } from '@/domain/ids';

import { getRepositories } from '@/repositories/container';

import { writeTimerPrefs } from '@/features/timer/store/timer-prefs';
import { timerMessageOf, type TimerState } from '@/features/timer/store/timer-state';
import {
  endSession,
  hydrateTimer,
  syncActiveSession,
  tickNow,
  type TimerContext,
} from '@/features/timer/store/timer-sync';
import { persistSession, readTodoTitle } from '@/features/timer/store/timer-writes';

import { todayKey } from '@/lib/date';

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
  dismissCompletion: () => void;
  dismissNotice: () => void;
  clearError: () => void;
};

/** 선택한 투두의 제목·카테고리 스냅샷. 없는 투두면 "할 일 없이" 로 떨어진다 (timer §4). */
async function resolveTodo(todoId: TodoId | null) {
  if (todoId === null) {
    return undefined;
  }
  return getRepositories().todos.getById(todoId);
}

/** 설정 저장 (R1·R9 — 둘이 같은 키를 쓴다). */
function savePrefs(state: Pick<TimerState, 'minutes' | 'soundOff'>): void {
  writeTimerPrefs({ minutes: state.minutes, soundOff: state.soundOff });
}

/** 대기 화면의 설정 액션 3개. */
function createSettingActions(
  ctx: TimerContext,
): Pick<TimerActions, 'setMinutes' | 'setSoundOff' | 'selectTodo'> {
  return {
    setMinutes: (minutes) => {
      try {
        validateFocusMinutes(minutes);
      } catch (error) {
        ctx.set({ error: timerMessageOf(error) });
        return;
      }
      ctx.set({ minutes, error: null });
      savePrefs(ctx.get());
    },
    setSoundOff: (soundOff) => {
      ctx.set({ soundOff });
      savePrefs(ctx.get());
    },
    selectTodo: (todoId) => {
      ctx.set({ selectedTodoId: todoId });
    },
  };
}

/** 시작 (R2·R5). 저장소를 먼저 읽는 것이 다중 탭 방어의 전부다. */
function createStartAction(ctx: TimerContext): Pick<TimerActions, 'start'> {
  return {
    start: async ({ minutes, todoId, remember = true }: TimerStartInput = {}) => {
      const state = ctx.get();
      if (state.session !== null) {
        ctx.set({ error: '이미 집중 중인 세션이 있어요' });
        return false;
      }
      const length = minutes ?? state.minutes;
      const target = todoId === undefined ? state.selectedTodoId : todoId;

      let plannedSeconds: number;
      try {
        plannedSeconds = validateFocusMinutes(length);
      } catch (error) {
        ctx.set({ error: timerMessageOf(error) });
        return false;
      }

      // R5: 저장소가 원천이다. 읽지 못하면 시작하지 않는다 — 실패를 열어 두면 두 탭이 동시에 달린다.
      let active: FocusSession | undefined;
      try {
        active = await getRepositories().focusSessions.getActive();
      } catch (error) {
        ctx.set({ error: timerMessageOf(error) });
        return false;
      }

      const todo = await resolveTodo(target);
      let session;
      try {
        session = startFocusSession(
          {
            date: todayKey() as DateKey,
            plannedSeconds,
            ...(todo === undefined ? {} : { todoId: todo.id, categoryId: todo.categoryId }),
            ...(active === undefined ? {} : { active }),
          },
          ctx.deps,
        );
      } catch (error) {
        // R5 "시작을 거부하고 그 세션을 보여 준다".
        if (active !== undefined) {
          ctx.set({
            session: active,
            todoTitle: await readTodoTitle(active.todoId),
            // 이 탭의 `now` 는 스토어를 만든 시각에 멈춰 있다 — 남의 세션을 그대로 보여 주려면
            // 시계부터 맞춰야 남은 시간이 옳다.
            now: ctx.deps.now(),
          });
        }
        ctx.set({ error: timerMessageOf(error) });
        return false;
      }

      ctx.set({
        session,
        todoTitle: todo?.title ?? null,
        sessionUnsaved: true,
        now: session.startedAt,
        completion: null,
        notice: null,
        error: null,
        ...(remember ? { minutes: length } : {}),
      });
      if (remember) {
        savePrefs(ctx.get());
      }

      try {
        await persistSession(session);
        ctx.set({ sessionUnsaved: false });
        return true;
      } catch (error) {
        // §2 에러: 타이머는 화면에서 계속 돌고 종료 시 다시 저장한다.
        ctx.set({ error: timerMessageOf(error) });
        return false;
      }
    },
  };
}

/** 일시정지·재개 (R6). 둘 다 세션 한 건만 쓴다. */
function createPauseActions(ctx: TimerContext): Pick<TimerActions, 'pause' | 'resume'> {
  const transition = async (rule: typeof pauseFocusSession): Promise<boolean> => {
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
  };

  return {
    pause: () => transition(pauseFocusSession),
    resume: () => transition(resumeFocusSession),
  };
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
    dismissCompletion: () => {
      ctx.set({ completion: null });
    },
    dismissNotice: () => {
      ctx.set({ notice: null });
    },
    clearError: () => {
      ctx.set({ error: null });
    },
  };
  return actions;
}
