// 날짜 키(DateKey) ↔ Date 변환, 주 계산(월요일 시작), nowIso() — 이 앱의 유일한 시계 구현 (date-strip.md §4, ADR-0005).
// 순수 함수: toDateKey/fromDateKey/addDays/startOfWeek 는 인자로 받은 Date/DateKey 만 본다 — Date.now() 를
// 직접 부르지 않는다(테스트 결정성). nowIso() 만 예외로, 실제 시계에 닿는 유일한 지점이다.
//
// 타임존: 이 앱은 투두를 "로컬 날짜"로 묶는다(date-strip.md §4). toDateKey/fromDateKey 는 항상
// Date#getFullYear/getMonth/getDate 같은 **로컬** 게터만 쓴다 — getUTC*/toISOString 을 쓰면 UTC 음수
// 오프셋 지역에서 자정 직후 만든 투두가 "어제"로 묶이는 버그가 난다. addDays 는 Date#setDate 로 로컬 달력
// 날짜만 옮기므로 DST 전환일도 안전하다(시각이 아니라 날짜 컴포넌트만 다룬다).

/**
 * 'YYYY-MM-DD' 형식의 날짜 키. `src/domain/date/date-key.ts` 의 `DateKey` 와 같은 모양을 자체 선언한다
 * — `lib` 은 `domain` 을 import 할 수 없다(src/lib/AGENTS.md 규칙 2). 두 선언을 바꿀 땐 같은 PR 에서 함께 바꾼다.
 */
export type DateKey = `${number}-${number}-${number}`;

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Date 를 그 지역 달력 기준 DateKey 로 바꾼다(로컬 게터만 사용). */
export function toDateKey(date: Date): DateKey {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` as DateKey;
}

/** DateKey 가 가리키는 그 지역 자정(00:00:00.000) Date 를 만든다. */
export function fromDateKey(key: DateKey): Date {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/** key 에서 n일 뒤(n 이 음수면 그만큼 전) DateKey. 월·연 경계, 윤년, DST 전환을 모두 올바르게 넘는다. */
export function addDays(key: DateKey, days: number): DateKey {
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

/** 현재 시각을 ISO 8601 UTC 문자열로 돌려준다. `MetaDeps.now` 의 런타임 구현(ADR-0005) — 이 파일에서 유일하게 실제 시계를 읽는다. */
export function nowIso(): string {
  return new Date().toISOString();
}
