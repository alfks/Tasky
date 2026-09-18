// 뽀모도로의 **기기별 런타임 상태** (timer P4·P5): 진행 중인 휴식과 오늘 끝낸 뽀모도로 수.
//
// 설정(`timer-prefs.ts`)과 키를 나눈 이유: 저쪽은 "다음에 쓸 값"(길이·소리·모드)이고 여기는
// "지금 진행 중인 것"이다. 한 레코드에 섞으면 휴식이 끝날 때마다 설정까지 되쓰게 되고,
// 저장된 값이 깨졌을 때 무엇을 버려야 하는지가 흐려진다.
//
// **왜 저장소(IndexedDB)가 아닌가**: 휴식·사이클 수를 저장소에 적으려면 표가 하나 늘거나
// `FocusSession` 에 필드가 붙는다 — 둘 다 ADR 이 필요한 스키마 변경이다(CLAUDE.md §7-9).
// 그리고 이 둘은 백업 대상도 아니다(기기별 진행 상태이지 기록이 아니다 — 기록은 세션 레코드가 맡는다).
//
// 읽기는 `timer-prefs.ts` 와 같은 이유로 **함수 안에서만** 한다(프리렌더에 localStorage 가 없다).
import type { PomodoroBreak, PomodoroCycle } from '@/features/timer/store/pomodoro';

/** P4·P5 가 함께 쓰는 키. 설정(`tasky.timer.v1`)과는 다른 레코드다. */
export const POMODORO_STATE_KEY = 'tasky.pomodoro.v1';

export type PomodoroPersisted = {
  readonly breakSession: PomodoroBreak | null;
  readonly cycle: PomodoroCycle | null;
};

export const EMPTY_POMODORO_STATE: PomodoroPersisted = { breakSession: null, cycle: null };

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null;
}

function parseBreak(value: unknown): PomodoroBreak | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const { kind, startedAt, plannedSeconds } = record;
  if (kind !== 'short' && kind !== 'long') {
    return null;
  }
  if (typeof startedAt !== 'string' || startedAt === '' || Number.isNaN(Date.parse(startedAt))) {
    return null;
  }
  if (typeof plannedSeconds !== 'number' || !Number.isFinite(plannedSeconds) || plannedSeconds <= 0) {
    return null;
  }
  return { kind, startedAt, plannedSeconds };
}

function parseCycle(value: unknown): PomodoroCycle | null {
  const record = asRecord(value);
  if (record === null) {
    return null;
  }
  const { date, completed } = record;
  if (typeof date !== 'string' || date === '') {
    return null;
  }
  if (typeof completed !== 'number' || !Number.isInteger(completed) || completed < 0) {
    return null;
  }
  return { date, completed };
}

/**
 * 저장된 JSON → 상태. **어떤 쓰레기가 들어와도 던지지 않는다** — 깨진 값 하나 때문에
 * 타이머 패널이 통째로 사라지면 안 된다(`parseTimerPrefs` 와 같은 원칙).
 */
export function parsePomodoroState(raw: string | null): PomodoroPersisted {
  if (raw === null) {
    return EMPTY_POMODORO_STATE;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return EMPTY_POMODORO_STATE;
  }
  const record = asRecord(parsed);
  if (record === null) {
    return EMPTY_POMODORO_STATE;
  }
  return { breakSession: parseBreak(record.breakSession), cycle: parseCycle(record.cycle) };
}

export function readPomodoroState(): PomodoroPersisted {
  try {
    return parsePomodoroState(globalThis.localStorage?.getItem(POMODORO_STATE_KEY) ?? null);
  } catch {
    return EMPTY_POMODORO_STATE;
  }
}

/** 저장 실패는 조용히 넘긴다 — 못 적으면 새로고침에서 휴식이 사라질 뿐 타이머는 그대로 돈다. */
export function writePomodoroState(state: PomodoroPersisted): void {
  try {
    globalThis.localStorage?.setItem(POMODORO_STATE_KEY, JSON.stringify(state));
  } catch {
    // 무시
  }
}
