// **시간이 믿을 수 없다는 전제**를 다루는 부분 (timer R2·R3·R4·R6·R9-a).
//
// 이 파일이 지키는 것 네 가지:
// 1. 표시는 `session` + `now` 에서 매번 다시 계산된다. 틱을 세지 않으므로 백그라운드 스로틀링으로
//    인터벌이 10분에 한 번만 돌아도 값이 어긋나지 않는다 — 다음 틱에 정확한 값이 나온다.
// 2. 완료 판정(`sweep`)은 틱·`visibilitychange`·앱 시작 세 군데에서 같은 순수 함수로 한다.
//    탭이 닫혀 있는 동안 끝난 세션도 다시 열면 그 자리에서 완료된다.
// 3. 완료의 `endedAt` 은 **현재 시각이 아니라** `startedAt + planned + pausedTotal` 이다(R4) —
//    잠들었다 깨어난 기기에서 6시간짜리 기록이 생기지 않는다.
// 4. 시계가 뒤로 가면(수동 변경·NTP 보정) 경과는 0 에서 멈춘다(`focusElapsedSeconds` 가 자른다).
//    타이머가 "되감기" 되는 것처럼 보이지만 기록이 음수가 되지는 않는다.
import type { FocusSession } from '@/domain/focus/focus-session';
import {
  cancelFocusSession,
  completeFocusSession,
  focusCompletionSignal,
  focusSessionSweep,
} from '@/domain/focus/focus-session.rules';
import type { MetaDeps } from '@/domain/meta';

import { getRepositories } from '@/repositories/container';

import {
  pomodoroAfterComplete,
  savePomodoro,
  sweepPomodoroBreak,
} from '@/features/timer/store/pomodoro-flow';
import { readPomodoroState } from '@/features/timer/store/pomodoro-state';
import { readTimerPrefs } from '@/features/timer/store/timer-prefs';
import {
  timerMessageOf,
  type TimerCompletion,
  type TimerNotice,
  type TimerState,
} from '@/features/timer/store/timer-state';
import {
  persistEnding,
  readTodoTitle,
  type TimerSerialize,
} from '@/features/timer/store/timer-writes';

/** 액션이 스토어를 읽고 쓰는 통로. zustand 의 `set`·`get` 을 그대로 받는다. */
export type TimerContext = {
  readonly set: (partial: Partial<TimerState>) => void;
  readonly get: () => TimerState;
  readonly deps: MetaDeps;
  /** 이 스토어의 쓰기 한 줄 큐 (R5). 읽고-쓰기 사이를 다른 쓰기가 끼어들지 못하게 한다. */
  readonly serialize: TimerSerialize;
};

/** 세션이 끝나는 세 가지 이유. `stop` 만 사용자가 누른 것이고 나머지는 시간이 만든 것이다. */
export type TimerEnding = 'complete' | 'expire' | 'stop';

/**
 * 세션을 끝낸다. 같은 틱에 두 번 들어와도 두 번째는 `session === null` 을 보고 그냥 돌아간다
 * (중복 완료 방지). 큐를 거치므로 시작·일시정지 쓰기와 순서가 뒤엉키지 않는다 (R5).
 *
 * 큐 **밖에서** 부르는 곳은 없다 — 안에서 또 `serialize` 를 부르면 교착이 된다.
 */
export function endSession(
  ctx: TimerContext,
  session: FocusSession,
  ending: TimerEnding,
): Promise<boolean> {
  return ctx.serialize(() => endSessionNow(ctx, session, ending));
}

/** 큐 차례가 왔을 때의 실제 종료. 상태 전이를 먼저 하고 저장이 뒤따른다. */
async function endSessionNow(
  ctx: TimerContext,
  session: FocusSession,
  ending: TimerEnding,
): Promise<boolean> {
  const current = ctx.get();
  if (current.session === null || current.session.id !== session.id) {
    return false;
  }
  const now = ctx.deps.now();
  const todoTitle = current.todoTitle;

  let entity;
  try {
    entity =
      ending === 'complete'
        ? completeFocusSession(session, ctx.deps)
        : cancelFocusSession(session, ctx.deps);
  } catch (error) {
    ctx.set({ error: timerMessageOf(error) });
    return false;
  }

  const recordedSeconds = entity.elapsedSeconds;
  const completion: TimerCompletion | null =
    ending === 'complete'
      ? { session: entity, signal: focusCompletionSignal(entity, now), todoTitle, recordedSeconds }
      : null;
  const notice: TimerNotice | null = ending === 'expire' ? { todoTitle, recordedSeconds } : null;

  // P3·P5: 완료했을 때만 사이클이 늘고 휴식이 붙는다. 중지(R7)·24시간 만료(R6)는 사용자가 끝까지
  // 집중한 것이 아니므로 뽀모도로를 한 개로 세지 않고 휴식도 주지 않는다.
  const advance =
    completion === null
      ? null
      : pomodoroAfterComplete(current, {
          date: entity.date,
          plannedSeconds: entity.plannedSeconds,
          signal: completion.signal,
          at: now,
        });

  ctx.set({
    session: null,
    todoTitle: null,
    sessionUnsaved: false,
    now,
    completion: completion ?? ctx.get().completion,
    notice: notice ?? ctx.get().notice,
    error: null,
    ...(advance ?? {}),
  });
  if (advance !== null) {
    savePomodoro(ctx.get());
  }

  try {
    await persistEnding(entity, ctx.deps);
    return true;
  } catch (error) {
    ctx.set({ error: timerMessageOf(error) });
    return false;
  }
}

/**
 * 한 시점의 정리 판정 (R4·R6). 완료·만료면 세션을 끝내고, 아니면 아무것도 하지 않는다.
 * 틱·재활성화·앱 시작이 **모두 이 함수 하나**를 부른다 — 세 경로가 갈리면 "탭을 열어 둔 채 끝났을 때"와
 * "닫았다 열었을 때"의 동작이 달라진다.
 */
export function sweepSession(ctx: TimerContext, session: FocusSession, now: string): boolean {
  const verdict = focusSessionSweep(session, now);
  if (verdict === 'none') {
    return false;
  }
  void endSession(ctx, session, verdict === 'complete' ? 'complete' : 'expire');
  return true;
}

/**
 * 1초 표시 갱신 (R3). 하는 일은 `now` 를 실제 시계로 바꾸는 것과 그 시점의 정리 판정뿐이다.
 * **남은 시간을 빼지 않는다** — 그래서 지연된 틱이 값을 어긋나게 할 수 없다.
 */
export function tickNow(ctx: TimerContext): void {
  const now = ctx.deps.now();
  ctx.set({ now });
  const session = ctx.get().session;
  if (session !== null) {
    sweepSession(ctx, session, now);
  }
  sweepBreak(ctx, now);
}

/**
 * 휴식의 정리 판정 (P4). **새 인터벌을 만들지 않는다** — 이미 도는 1초 틱에 얹는다.
 * 남은 시간만큼의 `setTimeout` 을 걸었다면 WebIDL `long`(32비트) 범위 밖의 지연이 `ToInt32` 로
 * 0 이 되어 즉시 발화하는 함정(T-52)을 다시 밟았을 것이다. 여기서는 그 위험 자체가 없다.
 */
export function sweepBreak(ctx: TimerContext, now: string): void {
  const swept = sweepPomodoroBreak(ctx.get(), now);
  if (swept === null) {
    return;
  }
  ctx.set(swept);
  savePomodoro(ctx.get());
}

/**
 * 저장소의 활성 세션과 화면을 맞춘다 (R2·R5). 앱 시작·탭 재활성화에서 부른다.
 *
 * **다른 탭**: 이 앱은 탭 사이에 실시간 채널을 두지 않는다. 대신 (1) 시작할 때 저장소를 읽어 거부하고(R5)
 * (2) 탭이 다시 보이는 순간 여기서 맞춘다. 그래서 다른 탭에서 중지·완료한 세션은 **이 탭을 볼 때** 사라진다.
 * 두 탭이 동시에 보이는 동안에는 어긋난 채로 있을 수 있다 — 알고 받아들인 한계다.
 */
export async function syncActiveSession(ctx: TimerContext): Promise<void> {
  const now = ctx.deps.now();
  ctx.set({ now });

  let stored: FocusSession | undefined;
  try {
    stored = await getRepositories().focusSessions.getActive();
  } catch (error) {
    ctx.set({ error: timerMessageOf(error) });
    return;
  }

  if (stored === undefined) {
    // 저장에 실패한 세션은 저장소에 없는 것이 당연하다 — 그것까지 내리면 화면에서 타이머가 사라진다.
    if (ctx.get().session !== null && !ctx.get().sessionUnsaved) {
      ctx.set({ session: null, todoTitle: null });
    }
    return;
  }

  const title = await readTodoTitle(stored.todoId);
  ctx.set({ session: stored, todoTitle: title, sessionUnsaved: false });
  sweepSession(ctx, stored, ctx.deps.now());
}

/** 앱 시작 (R1·R2·R4·R6). 기기 설정을 읽고 저장소의 세션을 이어 붙인다. */
export async function hydrateTimer(ctx: TimerContext): Promise<void> {
  const prefs = readTimerPrefs();
  ctx.set({ minutes: prefs.minutes, soundOff: prefs.soundOff, pomodoro: prefs.pomodoro });

  // P4: 휴식과 사이클 수는 기기별 저장에서 이어 붙인다. 휴식도 시각 기준이라(`pomodoro.ts`)
  // 꺼져 있던 동안 지나간 시간은 그냥 지나간 것이고, 아래 정리 판정이 그 자리에서 끝낸다.
  const stored = readPomodoroState();
  ctx.set({ breakSession: stored.breakSession, cycle: stored.cycle });

  await syncActiveSession(ctx);

  // 집중 세션이 살아 있으면 휴식은 남아 있을 수 없다(둘은 동시에 존재하지 않는다). 저장된 값이
  // 그렇게 말한다면 그 쪽이 낡은 것이다 — 저장소 레코드가 원천이므로(R2) 휴식을 버린다.
  if (ctx.get().session !== null && ctx.get().breakSession !== null) {
    ctx.set({ breakSession: null });
    savePomodoro(ctx.get());
  } else {
    sweepBreak(ctx, ctx.deps.now());
  }
  ctx.set({ hydrated: true });
}
