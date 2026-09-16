// 타이머 **시작** 액션 (timer R1·R2·R5). 시작만 따로 있는 이유는 세 가지를 한꺼번에 지켜야 해서다:
// 길이 검증(R1), 저장소의 활성 세션 확인(R5), 그리고 **연타·동시 호출이 세션을 둘 만들지 못하게 하는 것**.
// 나머지 액션은 `timer-actions.ts`, 저장 배선은 `timer-writes.ts`.
import type { DateKey } from '@/domain/date/date-key';
import type { FocusSession } from '@/domain/focus/focus-session';
import { startFocusSession, validateFocusMinutes } from '@/domain/focus/focus-session.rules';
import type { TodoId } from '@/domain/ids';
import type { Persistable } from '@/domain/meta';

import { getRepositories } from '@/repositories/container';

import type { TimerActions, TimerStartInput } from '@/features/timer/store/timer-actions';
import { writeTimerPrefs } from '@/features/timer/store/timer-prefs';
import { timerMessageOf, type TimerState } from '@/features/timer/store/timer-state';
import type { TimerContext } from '@/features/timer/store/timer-sync';
import { persistSession, readTodoTitle } from '@/features/timer/store/timer-writes';

import { todayKey } from '@/lib/date';

/** 설정 저장 (R1·R9 — 둘이 같은 키를 쓴다). */
function savePrefs(state: Pick<TimerState, 'minutes' | 'soundOff'>): void {
  writeTimerPrefs({ minutes: state.minutes, soundOff: state.soundOff });
}

/** 선택한 투두의 제목·카테고리 스냅샷. 없는 투두면 "할 일 없이" 로 떨어진다 (timer §4). */
async function resolveTodo(todoId: TodoId | null) {
  if (todoId === null) {
    return undefined;
  }
  return getRepositories().todos.getById(todoId);
}

/** 계획 시간·대상 투두를 정한다. 길이가 1~180 정수가 아니면 문구만 남기고 `null` 이다 (R1). */
function planStart(
  ctx: TimerContext,
  { minutes, todoId }: TimerStartInput,
): { plannedSeconds: number; length: number; target: TodoId | null } | null {
  const state = ctx.get();
  const length = minutes ?? state.minutes;
  try {
    return {
      plannedSeconds: validateFocusMinutes(length),
      length,
      target: todoId === undefined ? state.selectedTodoId : todoId,
    };
  } catch (error) {
    ctx.set({ error: timerMessageOf(error) });
    return null;
  }
}

/** R5 "시작을 거부하고 그 세션을 보여 준다" — 남의 세션을 이 탭에 그대로 올린다. */
async function showActiveSession(ctx: TimerContext, active: FocusSession): Promise<void> {
  ctx.set({
    session: active,
    todoTitle: await readTodoTitle(active.todoId),
    // 이 탭의 `now` 는 스토어를 만든 시각에 멈춰 있다 — 남의 세션을 그대로 보여 주려면
    // 시계부터 맞춰야 남은 시간이 옳다.
    now: ctx.deps.now(),
  });
}

/** 만든 세션을 화면에 올리고 저장한다. 저장에 실패해도 타이머는 화면에서 계속 돈다(§2 에러). */
async function beginSession(
  ctx: TimerContext,
  session: Persistable<FocusSession>,
  todoTitle: string | null,
  remember: { length: number } | null,
): Promise<boolean> {
  ctx.set({
    session,
    todoTitle,
    sessionUnsaved: true,
    now: session.startedAt,
    completion: null,
    notice: null,
    error: null,
    ...(remember === null ? {} : { minutes: remember.length }),
  });
  if (remember !== null) {
    savePrefs(ctx.get());
  }
  try {
    await persistSession(session);
    ctx.set({ sessionUnsaved: false });
    return true;
  } catch (error) {
    ctx.set({ error: timerMessageOf(error) });
    return false;
  }
}

/** 큐 차례가 왔을 때의 실제 시작. 여기서 읽는 상태는 앞의 쓰기가 끝난 뒤의 값이다. */
async function startNow(ctx: TimerContext, input: TimerStartInput): Promise<boolean> {
  if (ctx.get().session !== null) {
    ctx.set({ error: '이미 집중 중인 세션이 있어요' });
    return false;
  }
  const plan = planStart(ctx, input);
  if (plan === null) {
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

  const todo = await resolveTodo(plan.target);
  try {
    const session = startFocusSession(
      {
        date: todayKey() as DateKey,
        plannedSeconds: plan.plannedSeconds,
        ...(todo === undefined ? {} : { todoId: todo.id, categoryId: todo.categoryId }),
        ...(active === undefined ? {} : { active }),
      },
      ctx.deps,
    );
    const remember = input.remember ?? true;
    return await beginSession(
      ctx,
      session,
      todo?.title ?? null,
      remember ? { length: plan.length } : null,
    );
  } catch (error) {
    if (active !== undefined) {
      await showActiveSession(ctx, active);
    }
    ctx.set({ error: timerMessageOf(error) });
    return false;
  }
}

/**
 * 시작 (R2·R5). 저장소를 먼저 읽는 것이 다중 탭 방어의 전부다.
 *
 * **연타·동시 호출은 한 번의 시작으로 합친다**: 진행 중인 시작이 있으면 그 프라미스를 그대로 돌려준다.
 * 이것이 없으면 두 호출이 같은 "활성 세션 없음" 스냅샷을 읽어 running 세션이 2개 생긴다(R5 위반).
 * 큐(`ctx.serialize`)는 시작이 중지·완료 쓰기와 뒤엉키는 것까지 막는다.
 */
export function createStartAction(ctx: TimerContext): Pick<TimerActions, 'start'> {
  let inFlight: Promise<boolean> | null = null;
  return {
    start: (input: TimerStartInput = {}) => {
      if (inFlight !== null) {
        return inFlight;
      }
      const promise = ctx
        .serialize(() => startNow(ctx, input))
        .finally(() => {
          inFlight = null;
        });
      inFlight = promise;
      return promise;
    },
  };
}
