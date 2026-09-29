// 일 피커 격자의 키 이동 — 순수 계산(calendar-layout.md §3-A R16-a). React·DOM 을 참조하지 않는다.
//
// 한 걸음의 규칙은 전부 date-strip 이 이미 가진 것이다: ±1일·±7일은 `shiftWithinRange`(R6 범위),
// Home/End 는 `weekDays`(월요일 시작, R1), ±1달은 `shiftMonthWithinRange`(일 유지·말일 자르기,
// R14). 여기서는 키 이름과 그 함수를 잇기만 한다 — 새 날짜 계산을 짓지 않는다.
import type { DateKey } from '@/domain/date/date-key';

import { shiftMonthWithinRange } from '@/features/date-strip/lib/month';
import {
  DAYS_IN_WEEK,
  isWithinRange,
  shiftWithinRange,
  weekDays,
} from '@/features/date-strip/lib/week';

export type DayMove = 'left' | 'right' | 'up' | 'down' | 'home' | 'end' | 'pageUp' | 'pageDown';

/** `KeyboardEvent.key` → 이동 이름. Enter/Space 는 없다 — 확정은 네이티브 버튼 클릭에 맡긴다(중복 방지). */
export const DAY_KEY_MOVE: Partial<Record<string, DayMove>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'home',
  End: 'end',
  PageUp: 'pageUp',
  PageDown: 'pageDown',
};

/** 한 걸음. 범위(R6) 밖이면 `undefined` — 호출부는 그 자리에 머문다. */
export function moveDay(cursor: DateKey, move: DayMove): DateKey | undefined {
  const week = weekDays(cursor);
  const next = {
    left: () => shiftWithinRange(cursor, -1),
    right: () => shiftWithinRange(cursor, 1),
    up: () => shiftWithinRange(cursor, -DAYS_IN_WEEK),
    down: () => shiftWithinRange(cursor, DAYS_IN_WEEK),
    home: () => week[0],
    end: () => week[DAYS_IN_WEEK - 1],
    pageUp: () => shiftMonthWithinRange(cursor, -1),
    pageDown: () => shiftMonthWithinRange(cursor, 1),
  }[move]();
  return next !== undefined && isWithinRange(next) ? next : undefined;
}
