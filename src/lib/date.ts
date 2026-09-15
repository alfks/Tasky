// 날짜 키(DateKey) ↔ Date 변환, 주 계산(월요일 시작), nowIso()/todayKey() — 이 앱의 시계 구현 (date-strip.md §4, ADR-0005).
// 순수 함수: toDateKey/fromDateKey/addDays/startOfWeek 는 인자로 받은 Date/DateKey 만 본다 — Date.now() 를
// 직접 부르지 않는다(테스트 결정성). nowIso()·todayKey() 만 예외로, 실제 시계를 읽는 두 지점이다 — 호출부는
// (features 포함) new Date() 를 직접 부르지 말고 이 둘로 모은다. 그래야 vi.setSystemTime() 으로 둘 다 고정된다.
//
// 타임존: 이 앱은 투두를 "로컬 날짜"로 묶는다(date-strip.md §4). toDateKey/fromDateKey 는 항상
// Date#getFullYear/getMonth/getDate 같은 **로컬** 게터만 쓴다 — getUTC*/toISOString 을 쓰면 UTC 음수
// 오프셋 지역에서 자정 직후 만든 투두가 "어제"로 묶이는 버그가 난다. addDays 는 Date#setDate 로 로컬 달력
// 날짜만 옮기므로 DST 전환일도 안전하다(시각이 아니라 날짜 컴포넌트만 다룬다).

/**
 * 'YYYY-MM-DD' 형식의 날짜 키. `src/domain/date/date-key.ts` 의 `DateKey` 와 같은 모양을 자체 선언한다
 * — `lib` 은 `domain` 을 import 할 수 없다(src/lib/AGENTS.md 규칙 2). 두 선언을 바꿀 땐 같은 PR 에서 함께 바꾼다.
 *
 * 이 타입 자체는 **형식**(숫자꼴 문자열 3개를 '-'로 이은 모양)만 표현하고 **값의 유효성**(실존하는 날짜인지)은
 * 보장하지 않는다 — `'2026-13-01'` 도 구조적으로는 DateKey 다. 앱 밖에서 온 문자열(백업 복원 등)은 반드시
 * `isDateKey()` 로 먼저 검증할 것.
 */
export type DateKey = `${number}-${number}-${number}`;

const DATE_KEY_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Date 를 그 지역 달력 기준 DateKey 로 바꾼다(로컬 게터만 사용). */
export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` as DateKey;
}

/**
 * `value` 가 실존하는 날짜를 가리키는 DateKey('YYYY-MM-DD', 0 채움)인지 검사한다. 형식뿐 아니라
 * 달력상 실제로 존재하는 날짜인지(윤년 2/29 허용, 평년 2/29·2/30·13월 등은 거부)까지 확인한다.
 * `DateKey` 타입 자체는 이 검사를 대신하지 않으므로(위 주석 참고), 외부 문자열(백업 복원 등)은 이 함수로
 * 먼저 걸러야 한다.
 */
export function isDateKey(value: unknown): value is DateKey {
  if (typeof value !== 'string' || !DATE_KEY_FORMAT.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  // 자바스크립트 Date 는 범위 밖 월/일을 다음 달/다음 해로 조용히 넘겨버린다(예: 2/30 → 3/2).
  // 왕복한 컴포넌트가 입력과 다르면 실존하지 않는 날짜였다는 뜻이다. 두 자리 연도(0~99)를
  // 1900년대로 재해석하는 Date 의 동작도 이 대조로 함께 걸러진다.
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

/**
 * DateKey 가 가리키는 그 지역 자정(00:00:00.000) Date 를 만든다.
 *
 * `key` 가 실존하지 않는 날짜(형식은 맞지만 '2026-02-30' 등)나 형식이 아예 다른 문자열이면 조용히
 * 정규화하지 않고 `RangeError` 를 던진다 — 이 함수는 `addDays`/`startOfWeek` 를 포함해 이 파일의 다른
 * 함수들이 내부적으로 쓰는 공통 진입점이라, 여기서 막아야 하위 함수 전체가 안전해진다. 호출부가 이미
 * `isDateKey()` 로 검증한 값을 넘긴다면 이 경로는 절대 타지 않는다(정상 경로에 비용이 없다).
 */
export function fromDateKey(key: DateKey): Date {
  if (!isDateKey(key)) {
    throw new RangeError(`유효하지 않은 DateKey 입니다: ${JSON.stringify(key)}`);
  }
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** key 에서 n일 뒤(n 이 음수면 그만큼 전) DateKey. 월·연 경계, 윤년, DST 전환을 모두 올바르게 넘는다. */
export function addDays(key: DateKey, days: number): DateKey {
  if (!Number.isInteger(days)) {
    throw new RangeError(`addDays 의 days 는 정수여야 합니다: ${days}`);
  }
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return toDateKey(date);
}

/** key 가 속한 주의 월요일 DateKey (주는 월요일 시작 — date-strip.md R1). */
export function startOfWeek(key: DateKey): DateKey {
  const dayIndex = fromDateKey(key).getDay(); // 0=일 .. 6=토
  const daysSinceMonday = (dayIndex + 6) % 7;
  return addDays(key, -daysSinceMonday);
}

/** 현재 시각을 ISO 8601 UTC 문자열로 돌려준다. `MetaDeps.now` 의 런타임 구현(ADR-0005) — 실제 시계를 읽는다. */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 오늘(호출 시점의 로컬 달력 기준) DateKey. 실제 시계를 읽는다(date-strip.md R2·R12, timer.md). */
export function todayKey(): DateKey {
  return toDateKey(new Date());
}
