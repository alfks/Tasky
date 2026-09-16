// 주 계산과 이동 범위 — 날짜 스트립의 순수 계산부(date-strip.md R1·R4·R6). React·저장소를 참조하지 않는다.
//
// 주 시작이 월요일로 **고정**인 것은 확정된 제품 결정이다(주 시작 요일 설정은 스펙 §6 범위 밖).
// 실제 월요일 계산은 `@/lib/date` 의 `startOfWeek` 한 곳에만 있고 여기서는 그것을 7칸으로 펼치기만 한다.
import type { DateKey } from '@/domain/date/date-key';

import { addDays, startOfWeek } from '@/lib/date';

/** 이동 가능 범위의 첫 날 (R6). */
export const MIN_DATE_KEY: DateKey = '1970-01-01';
/** 이동 가능 범위의 마지막 날 (R6). */
export const MAX_DATE_KEY: DateKey = '2099-12-31';

/** 한 주의 칸 수. 월요일 시작 7일 (R1). */
export const DAYS_IN_WEEK = 7;

/** `date` 가 이동 가능 범위(R6) 안인지. 양끝을 포함한다. */
export function isWithinRange(date: DateKey): boolean {
  // DateKey 는 0 채움 고정폭이라 사전순 비교가 날짜 순서와 같다.
  return date >= MIN_DATE_KEY && date <= MAX_DATE_KEY;
}

/** 범위 밖 날짜를 양끝으로 당긴다 (R6). 범위 안이면 그대로. */
export function clampToRange(date: DateKey): DateKey {
  if (date < MIN_DATE_KEY) return MIN_DATE_KEY;
  if (date > MAX_DATE_KEY) return MAX_DATE_KEY;
  return date;
}

/**
 * `date` 가 속한 주의 월요일부터 7일 (R1).
 *
 * 범위(R6) 밖으로 삐져나가는 칸도 그대로 만든다 — 1970-01-01 은 목요일이라 그 주의 월·화·수는
 * 1969년이다. 칸을 지우면 주가 들쭉날쭉해지므로, 범위 밖 칸은 렌더 단계에서 비활성으로 표시한다.
 */
export function weekDays(date: DateKey): DateKey[] {
  const monday = startOfWeek(date);
  return Array.from({ length: DAYS_IN_WEEK }, (_, index) => addDays(monday, index));
}

/** `date` 에서 `days` 일 이동한 날짜. 범위 밖이면 `undefined` — 호출부는 이것으로 버튼을 비활성한다 (R6). */
export function shiftWithinRange(date: DateKey, days: number): DateKey | undefined {
  const next = addDays(date, days);
  return isWithinRange(next) ? next : undefined;
}
