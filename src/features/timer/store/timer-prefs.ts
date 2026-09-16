// 기기별 타이머 설정 (timer.md R1·R9): 마지막으로 쓴 길이와 소리 끄기 토글.
//
// 저장소(`Settings`)가 아니라 localStorage 인 이유는 스펙이 둘 다 **기기별**로 못 박았기 때문이다
// (R1 "마지막 사용 길이를 기기별로 기억", R9 "같은 키에 함께 저장"). 백업 대상도 아니다.
//
// **읽기는 모듈 로드 시점이 아니라 함수 안에서만** 한다 — 이 앱은 Cloudflare Workers 에서 프리렌더되고
// 거기엔 localStorage 가 없다(ADR-0010). 스토어의 초기 상태는 `DEFAULT_TIMER_PREFS` 이고,
// 실제 값은 브라우저에서 `hydrate()` 가 읽어 덮는다.
import {
  FOCUS_DEFAULT_MINUTES,
  FOCUS_MAX_MINUTES,
  FOCUS_MIN_MINUTES,
} from '@/domain/focus/focus-session.rules';

/** R1·R9 가 **같은 키**를 쓴다 — 길이와 소리 설정이 한 레코드다. */
export const TIMER_PREFS_KEY = 'tasky.timer.v1';

export type TimerPrefs = {
  /** 다음에 시작할 길이(분). 1~180 정수. */
  readonly minutes: number;
  /** 완료 차임을 끄는가 (R9). 끄더라도 카드·탭 제목은 남는다 — 소리는 유일한 통로가 아니다. */
  readonly soundOff: boolean;
};

export const DEFAULT_TIMER_PREFS: TimerPrefs = {
  minutes: FOCUS_DEFAULT_MINUTES,
  soundOff: false,
};

/** 범위를 벗어난 길이는 기본값으로. 저장된 값이 깨져 있어도 타이머는 떠야 한다. */
function normalizeMinutes(value: unknown): number {
  return typeof value === 'number' &&
    Number.isInteger(value) &&
    value >= FOCUS_MIN_MINUTES &&
    value <= FOCUS_MAX_MINUTES
    ? value
    : FOCUS_DEFAULT_MINUTES;
}

/**
 * 저장된 JSON 문자열 → 설정. **어떤 쓰레기가 들어와도 던지지 않는다** — 사용자가 손댔거나
 * 다른 버전이 쓴 값 때문에 타이머 패널이 통째로 사라지면 안 된다.
 */
export function parseTimerPrefs(raw: string | null): TimerPrefs {
  if (raw === null) {
    return DEFAULT_TIMER_PREFS;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return DEFAULT_TIMER_PREFS;
  }
  if (typeof parsed !== 'object' || parsed === null) {
    return DEFAULT_TIMER_PREFS;
  }
  const record = parsed as Record<string, unknown>;
  return {
    minutes: normalizeMinutes(record.minutes),
    soundOff: record.soundOff === true,
  };
}

/** 브라우저에서만 의미가 있다. 사생활 보호 모드·차단된 저장소에서는 기본값을 돌려준다. */
export function readTimerPrefs(): TimerPrefs {
  try {
    return parseTimerPrefs(globalThis.localStorage?.getItem(TIMER_PREFS_KEY) ?? null);
  } catch {
    return DEFAULT_TIMER_PREFS;
  }
}

/** 저장 실패는 조용히 넘긴다 — 설정 기억은 편의이고, 못 적었다고 알릴 일이 아니다. */
export function writeTimerPrefs(prefs: TimerPrefs): void {
  try {
    globalThis.localStorage?.setItem(TIMER_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // 무시
  }
}
