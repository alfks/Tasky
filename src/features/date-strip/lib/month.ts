// 월 격자 계산 — 날짜 스트립 월 보기의 순수 계산부(date-strip.md R14~R17). React·저장소를 참조하지 않는다.
//
// 주 계산과 같은 파일에 두지 않는 이유: `week.ts` 는 "한 줄 7칸"이라는 단일 형태만 다루고 이동 범위
// (R6)의 단일 소스이기도 하다. 월은 그 위에 얹히는 계산이라(격자의 첫 칸은 결국 **어떤 주의 월요일**)
// 범위·주 계산을 여기서 다시 쓰되 되돌려 쓰지는 않는다 — 의존은 month → week 한 방향이다.
import type { DateKey } from '@/domain/date/date-key';

import { DAYS_IN_WEEK, isWithinRange } from '@/features/date-strip/lib/week';

import { addDays, startOfWeek } from '@/lib/date';

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' 를 숫자 셋으로. 문자열을 그대로 쪼개므로 타임존의 영향을 받지 않는다. */
function parts(date: DateKey): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

/**
 * `year`년 `month`월(1 기반)의 마지막 날짜(28~31, 윤년 포함). `new Date(y, m, 0)` 은 그 달의
 * 마지막 날이다.
 *
 * "일 유지 + 말일 자르기" 규칙의 단일 소스는 이 파일이다 — `year-month.ts` 의 `withYearMonth`
 * 도 이 함수와 `shiftMonthWithinRange` 를 그대로 가져다 쓴다(같은 규칙을 두 번 짜지 않는다).
 */
export function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

/** 같은 달인지 (R16 의 '이 달 밖' 판정). 연도까지 본다 — 12월과 다음 해 12월은 다른 달이다. */
export function isSameMonth(a: DateKey, b: DateKey): boolean {
  return a.slice(0, 7) === b.slice(0, 7);
}

/** `date` 가 속한 달의 1일 (R15). */
export function startOfMonth(date: DateKey): DateKey {
  const { year, month } = parts(date);
  return `${year}-${pad2(month)}-01` as DateKey;
}

/** `date` 가 속한 달의 마지막 날 (R15). */
export function endOfMonth(date: DateKey): DateKey {
  const { year, month } = parts(date);
  return `${year}-${pad2(month)}-${pad2(daysInMonth(year, month))}` as DateKey;
}

/**
 * `date` 가 속한 달의 격자 칸 전체 (R15).
 *
 * 1일이 속한 주의 **월요일**부터 마지막 날이 속한 주의 **일요일**까지 이어 붙인다 — 그래서 결과는
 * 항상 7의 배수이고 **끊김 없는 연속 범위**다. 연속이라는 점이 중요하다: 요약은 이 배열의 양끝만
 * 넘겨 `listByDateRange` 한 번으로 읽는다(R17, 칸마다 조회하지 않는다).
 *
 * 줄 수는 달마다 4~6줄로 다르다. 6줄로 고정해 빈 줄을 채우지 않는 이유는, 그 줄이 전부 다음 달
 * 날짜라 "이 달"의 경계가 흐려지고 클릭 가능한 칸만 7개 늘기 때문이다.
 */
export function monthGridDays(date: DateKey): DateKey[] {
  const first = startOfWeek(startOfMonth(date));
  const last = addDays(startOfWeek(endOfMonth(date)), DAYS_IN_WEEK - 1);
  const days: DateKey[] = [];
  for (let day = first; day <= last; day = addDays(day, 1)) {
    days.push(day);
  }
  return days;
}

/** 6줄(42칸) 격자 — 일 피커가 쓴다(calendar-layout.md §3-A R15-a). */
export const SIX_WEEKS = DAYS_IN_WEEK * 6;

/**
 * `monthGridDays` 결과를 **항상 42칸**으로 채운다 — 부족한 줄은 다음 달 날짜를 이어 붙인다. 월 보기
 * (R15)는 4~6줄 그대로 두지만, 팝오버 피커는 달을 넘길 때 아래 `[오늘][내일]` 줄이 위아래로 튀면
 * 안 되고 빈 띠를 남기는 것도 구멍처럼 보여(리뷰 Major) 칸으로 채운다. 이 달 밖 칸은 이미 흐린
 * 숫자 + 클릭 확정이라 표현·동작이 그대로 맞는다. 범위(R6) 끝을 넘는 칸은 렌더가 비활성으로 표시한다.
 */
export function padToSixWeeks(days: readonly DateKey[]): DateKey[] {
  const padded = [...days];
  while (padded.length < SIX_WEEKS) {
    padded.push(addDays(padded[padded.length - 1], 1));
  }
  return padded;
}

/** `monthGridDays` 의 결과를 7칸짜리 줄로 자른다 (R15). 격자 렌더가 `role="row"` 를 그리는 데 쓴다. */
export function chunkIntoWeeks(days: readonly DateKey[]): DateKey[][] {
  const rows: DateKey[][] = [];
  for (let index = 0; index < days.length; index += DAYS_IN_WEEK) {
    rows.push(days.slice(index, index + DAYS_IN_WEEK));
  }
  return rows;
}

/**
 * `date` 에서 `months` 달 이동한 날짜. 범위(R6) 밖이면 `undefined` — 호출부는 이것으로 버튼을 비활성한다.
 *
 * 일(day)은 **목적지 달의 길이로 자른다**: 1월 31일에서 한 달 뒤는 2월 28일(윤년이면 29일)이다.
 * `Date#setMonth` 에 맡기면 3월 3일로 넘어가 버려 "다음 달" 버튼이 2월을 건너뛴다.
 */
export function shiftMonthWithinRange(date: DateKey, months: number): DateKey | undefined {
  const { year, month, day } = parts(date);
  const total = year * 12 + (month - 1) + months;
  const nextYear = Math.floor(total / 12);
  const nextMonth = (total % 12) + 1;
  const next = `${nextYear}-${pad2(nextMonth)}-${pad2(
    Math.min(day, daysInMonth(nextYear, nextMonth)),
  )}` as DateKey;
  return isWithinRange(next) ? next : undefined;
}
