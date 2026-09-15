// 집중 세션 규칙 (timer.md R1~R9-a). **시각 산술은 전부 주입된 `now` 기준**이고 틱을 누적하지 않는다(R3)
// — 백그라운드 탭에서 인터벌이 지연돼도 값이 어긋나지 않는 이유가 이것이다.
import type { DateKey } from '@/domain/date/date-key';
import { addSeconds, diffSeconds } from '@/domain/date/instant';
import { DomainError } from '@/domain/errors';
import type { FocusSession } from '@/domain/focus/focus-session';
import type { CategoryId, TodoId } from '@/domain/ids';
import { createMeta, touch, type MetaDeps, type Persistable } from '@/domain/meta';

/** 길이 입력 범위 (timer R1). */
export const FOCUS_MIN_MINUTES = 1;
export const FOCUS_MAX_MINUTES = 180;
export const FOCUS_DEFAULT_MINUTES = 25;
/** 일시정지 자동 취소 한계 (timer R6). */
export const FOCUS_PAUSE_EXPIRY_SECONDS = 24 * 60 * 60;
/** "지금 막 끝났다" 로 볼 수 있는 한계 (timer R9-a). */
export const FOCUS_FRESH_COMPLETION_SECONDS = 2 * 60;

/** 실행 중이거나 일시정지 중인 세션인지 (timer R5: 이 상태는 동시에 최대 1개). */
export function isActiveFocusSession(session: FocusSession): boolean {
  return session.status === 'running' || session.status === 'paused';
}

/** 1~180분 정수만 허용하고 초로 바꾼다 (timer R1). */
export function validateFocusMinutes(minutes: number): number {
  if (!Number.isInteger(minutes) || minutes < FOCUS_MIN_MINUTES || minutes > FOCUS_MAX_MINUTES) {
    throw new DomainError('FOCUS_MINUTES_INVALID', String(minutes));
  }
  return minutes * 60;
}

/**
 * 경과 초 (timer R3): `min(planned, now − startedAt − pausedTotal − (pausedAt ? now − pausedAt : 0))`.
 * 음수가 되지 않게 0 으로 자른다(시계가 뒤로 간 기기).
 */
export function focusElapsedSeconds(session: FocusSession, now: string): number {
  const paused =
    session.pausedAt === undefined ? 0 : Math.max(0, diffSeconds(session.pausedAt, now));
  const raw = diffSeconds(session.startedAt, now) - session.pausedTotalSeconds - paused;
  return Math.min(session.plannedSeconds, Math.max(0, Math.floor(raw)));
}

/** 남은 초. 표시용(링·헤더 칩)이며 0 아래로 내려가지 않는다. */
export function focusRemainingSeconds(session: FocusSession, now: string): number {
  return Math.max(0, session.plannedSeconds - focusElapsedSeconds(session, now));
}

/** 새 세션 (timer R2·R5). 저장소에 활성 세션이 있으면 시작을 거부한다. */
export function startFocusSession(
  input: {
    date: DateKey;
    plannedSeconds: number;
    todoId?: TodoId;
    categoryId?: CategoryId;
    /** `focusSessions.getActive()` 결과. 있으면 시작할 수 없다. */
    active?: FocusSession;
  },
  deps: MetaDeps,
): Persistable<FocusSession> {
  if (input.active !== undefined && isActiveFocusSession(input.active)) {
    throw new DomainError('FOCUS_SESSION_ACTIVE_EXISTS', input.active.id);
  }
  const startedAt = deps.now();
  return createMeta<FocusSession>(deps, {
    ...(input.todoId === undefined ? {} : { todoId: input.todoId }),
    ...(input.categoryId === undefined ? {} : { categoryId: input.categoryId }),
    date: input.date,
    plannedSeconds: input.plannedSeconds,
    startedAt,
    pausedTotalSeconds: 0,
    elapsedSeconds: 0,
    status: 'running',
  });
}

/** 일시정지 (timer R6). `pausedAt` 만 기록하고 경과는 시각으로 계산된다. */
export function pauseFocusSession(
  session: FocusSession,
  deps: MetaDeps,
): Persistable<FocusSession> {
  if (session.status !== 'running') {
    throw new DomainError('FOCUS_SESSION_NOT_RUNNING', session.status);
  }
  const at = deps.now();
  return touch(
    {
      ...session,
      status: 'paused',
      pausedAt: at,
      elapsedSeconds: focusElapsedSeconds(session, at),
    },
    at,
  );
}

/** 재개 (timer R6): 멈춰 있던 시간을 `pausedTotalSeconds` 에 더하고 `pausedAt` 을 지운다. */
export function resumeFocusSession(
  session: FocusSession,
  deps: MetaDeps,
): Persistable<FocusSession> {
  if (session.status !== 'paused' || session.pausedAt === undefined) {
    throw new DomainError('FOCUS_SESSION_NOT_PAUSED', session.status);
  }
  const at = deps.now();
  const pausedTotalSeconds =
    session.pausedTotalSeconds + Math.max(0, Math.floor(diffSeconds(session.pausedAt, at)));
  const { pausedAt: _resumed, ...rest } = session;
  return touch({ ...rest, status: 'running', pausedTotalSeconds }, at);
}

/**
 * 완료 (timer R4). `endedAt` 은 **현재 시각이 아니라** `startedAt + planned + pausedTotal` 이다 —
 * 백그라운드에서 지나간 시간이 기록을 부풀리지 않게 한다. `elapsedSeconds` 는 계획 시간 그대로다.
 */
export function completeFocusSession(
  session: FocusSession,
  deps: MetaDeps,
): Persistable<FocusSession> {
  if (!isActiveFocusSession(session)) {
    throw new DomainError('FOCUS_SESSION_ENDED', session.status);
  }
  const { pausedAt: _ended, ...rest } = session;
  const endedAt = addSeconds(
    session.startedAt,
    session.plannedSeconds + session.pausedTotalSeconds,
  );
  return touch(
    {
      ...rest,
      status: 'completed',
      endedAt,
      elapsedSeconds: session.plannedSeconds,
    },
    deps.now(),
  );
}

/** 중지(취소) (timer R7). 경과는 기록되므로 확인 대화상자가 없다. */
export function cancelFocusSession(
  session: FocusSession,
  deps: MetaDeps,
): Persistable<FocusSession> {
  if (!isActiveFocusSession(session)) {
    throw new DomainError('FOCUS_SESSION_ENDED', session.status);
  }
  const at = deps.now();
  const elapsedSeconds = focusElapsedSeconds(session, at);
  const { pausedAt: _ended, ...rest } = session;
  return touch({ ...rest, status: 'canceled', endedAt: at, elapsedSeconds }, at);
}

/**
 * 앱 시작·재활성화 시점의 정리 판정 (timer R4·R6).
 * - `complete`: 계획 시간을 채웠다 → `completeFocusSession`
 * - `expire`: 일시정지로 24시간이 지났다 → `cancelFocusSession` + 정리 카드
 * - `none`: 그대로 계속
 */
export function focusSessionSweep(
  session: FocusSession,
  now: string,
): 'complete' | 'expire' | 'none' {
  if (!isActiveFocusSession(session)) {
    return 'none';
  }
  if (focusElapsedSeconds(session, now) >= session.plannedSeconds) {
    return 'complete';
  }
  if (
    session.pausedAt !== undefined &&
    diffSeconds(session.pausedAt, now) >= FOCUS_PAUSE_EXPIRY_SECONDS
  ) {
    return 'expire';
  }
  return 'none';
}

/**
 * 완료 신호 등급 (timer R9·R9-a). `now − endedAt > 2분`이면 기록 카드(a)만 주고 차임·탭 제목은 주지 않는다 —
 * 사흘 전 끝난 세션에 소리가 울리면 사용자가 원인을 알 수 없기 때문이다.
 */
export function focusCompletionSignal(session: FocusSession, now: string): 'full' | 'record-only' {
  if (session.endedAt === undefined) {
    return 'record-only';
  }
  return diffSeconds(session.endedAt, now) > FOCUS_FRESH_COMPLETION_SECONDS
    ? 'record-only'
    : 'full';
}
