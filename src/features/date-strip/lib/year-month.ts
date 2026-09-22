// 년·월 피커의 순수 계산 (calendar-layout.md §3 R15·R16). React·DOM 을 참조하지 않는다.
//
// 이동 가능 범위는 date-strip 의 MIN_DATE_KEY~MAX_DATE_KEY(week.ts, R6 의 단일 소스)와 같은 해
// 범위다 — 숫자를 다시 적지 않고 그 상수에서 뽑는다(범위가 바뀌어도 여기가 조용히 갈리지 않는다).
// 범위가 딱 연 단위로 끊기므로(1월~12월 전부 유효) 개별 월 버튼을 비활성으로 만들 일은 없고,
// 범위 끝은 **년 스테퍼**(이전 해/다음 해)에서만 갈린다(calendar-layout.md R15).
//
// "일 유지 + 말일 자르기" 규칙은 여기서 다시 짜지 않는다 — `month.ts` 가 그 규칙의 단일 소스라
// `withYearMonth` 는 그 파일의 `daysInMonth`·`shiftMonthWithinRange` 위에 얹는다.
import type { DateKey } from '@/domain/date/date-key';

import { daysInMonth, shiftMonthWithinRange } from '@/features/date-strip/lib/month';
import { MAX_DATE_KEY, MIN_DATE_KEY } from '@/features/date-strip/lib/week';

/** 이동 가능 범위의 첫 해 (week.ts 의 `MIN_DATE_KEY` 에서 뽑는다 — 숫자를 복제하지 않는다). */
export const MIN_YEAR = Number(MIN_DATE_KEY.slice(0, 4));
/** 이동 가능 범위의 마지막 해 (week.ts 의 `MAX_DATE_KEY` 에서 뽑는다). */
export const MAX_YEAR = Number(MAX_DATE_KEY.slice(0, 4));

/** 년·월 한 쌍. `month` 은 1(1월)~12(12월) — Date 의 0-based 월 인덱스와 다르다. */
export type YearMonth = { year: number; month: number };

/** `date` 에서 년·월을 뽑는다. */
export function yearMonthOf(date: DateKey): YearMonth {
  const [year, month] = date.split('-').map(Number);
  return { year, month };
}

/** 월 이름 'M월' (R17·R18). */
export function monthLabel(month: number): string {
  return `${month}월`;
}

/** `year`년 `month`월(1-based)의 마지막 날짜(28~31, 윤년 포함). 단일 소스는 `month.ts`. */
export { daysInMonth };

/**
 * `date` 의 일(日)을 유지한 채 `target` 년·월로 옮긴다 (R15). 목적지 달에 없는 날(1/31 → 2월)은
 * 그 달의 마지막 날로 자른다 — 달을 건너뛰지 않는다.
 *
 * 자르는 규칙 자체는 `month.ts` 의 `shiftMonthWithinRange`(date-strip.md R14 의 ‹/› 이동과 같은
 * 규칙)를 그대로 쓴다 — "몇 달을 이동하는가" 만 여기서 계산해 넘긴다. `target` 은 항상 연 스테퍼
 * (`shiftYear`)로 [MIN_YEAR, MAX_YEAR] 안으로 당겨진 값이라 결과는 항상 이동 가능 범위 안이고,
 * `shiftMonthWithinRange` 가 `undefined` 를 낼 일은 없다 — 그래도 타입상 `undefined` 가 나오면
 * (호출 계약이 깨진 경우) 원래 날짜를 그대로 돌려주는 안전망을 둔다.
 */
export function withYearMonth(date: DateKey, target: YearMonth): DateKey {
  const current = yearMonthOf(date);
  const months = (target.year - current.year) * 12 + (target.month - current.month);
  return shiftMonthWithinRange(date, months) ?? date;
}

/** 해 스테퍼 한 걸음(`delta`=±1, R15·R16 PageUp/PageDown). 월은 그대로 두고 해만 범위 안으로 당긴다. */
export function shiftYear(ym: YearMonth, delta: number): YearMonth {
  const year = ym.year + delta;
  return { year: Math.min(Math.max(year, MIN_YEAR), MAX_YEAR), month: ym.month };
}

/** R16 의 월 격자 roving 이동 이름. 실제 `KeyboardEvent.key` 문자열과의 매핑은 컴포넌트가 한다. */
export type MonthGridMove =
  'left' | 'right' | 'up' | 'down' | 'home' | 'end' | 'pageUp' | 'pageDown';

/** 1970년 1월을 0 으로 하는 총 개월 수. 해 경계를 넘는 상대 이동(←/→/↑/↓)의 클램프에 쓴다. */
function toTotalMonths(ym: YearMonth): number {
  return ym.year * 12 + (ym.month - 1);
}

function fromTotalMonths(total: number): YearMonth {
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

const MIN_TOTAL_MONTHS = MIN_YEAR * 12;
const MAX_TOTAL_MONTHS = MAX_YEAR * 12 + 11;

/**
 * `ym` 에서 `delta`개월 이동. 해 경계를 넘으면 해도 함께 옮긴다(12월 + 1 → 다음 해 1월).
 *
 * **월 단위 총합으로 클램프한다** — 해만 클램프하면(`shiftYear` 처럼) 2099년 12월에서 오른쪽으로
 * 한 칸 더 갈 때 "2100년 1월" 이 "2099년 1월" 로 뒤로 튀는 사고가 난다(해만 당기고 월은 그대로
 * 남아서다). 총 개월 수를 범위 끝에서 그대로 멈추면 "2099년 12월에 머문다" 가 된다.
 */
function shiftMonth(ym: YearMonth, delta: number): YearMonth {
  const total = Math.min(Math.max(toTotalMonths(ym) + delta, MIN_TOTAL_MONTHS), MAX_TOTAL_MONTHS);
  return fromTotalMonths(total);
}

/** R16 의 월 격자 roving 이동 한 걸음. */
export function moveMonthFocus(ym: YearMonth, move: MonthGridMove): YearMonth {
  switch (move) {
    case 'left':
      return shiftMonth(ym, -1);
    case 'right':
      return shiftMonth(ym, 1);
    case 'up':
      return shiftMonth(ym, -3);
    case 'down':
      return shiftMonth(ym, 3);
    case 'home':
      return { ...ym, month: 1 };
    case 'end':
      return { ...ym, month: 12 };
    case 'pageUp':
      return shiftYear(ym, -1);
    case 'pageDown':
      return shiftYear(ym, 1);
  }
}
