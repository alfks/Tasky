// 루틴(반복 할 일) 규칙 — 시작일·종료일과 반복 패턴(매주 n요일 / 매달 n일)에서, 실제로 투두를 만들
// 날짜 목록을 계산하는 순수 함수 하나가 전부다. "루틴" 자체는 엔티티로 저장하지 않는다: 이 함수가
// 돌려준 날짜마다 독립된 `Todo` 를 만들고(호출부는 `createTodo`), 그 뒤로는 서로 다른 평범한 투두라
// 하나씩 편집·삭제된다(반복 정의를 통째로 바꾸거나 취소하는 기능은 아직 없다 — 필요해지면 그때 별도
// 엔티티로 승격한다).
import { addCivilDays, dayOfMonthOf, dayOfWeekOf, isValidDateKey } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import { DomainError } from '@/domain/errors';

/** 반복 패턴. 요일은 0(일)~6(토), 일은 1~31(그 달에 없는 날은 그 달만 건너뛴다 — 31일 반복의 2월 등). */
export type RoutineRecurrence =
  | { type: 'weekly'; daysOfWeek: readonly number[] }
  | { type: 'monthly'; daysOfMonth: readonly number[] };

/** 한 번에 만들 수 있는 최대 기간(일, 시작~종료 포함). 끝없는 반복으로 대량 생성되는 것을 막는다. */
export const ROUTINE_MAX_SPAN_DAYS = 366;

function validateRecurrence(recurrence: RoutineRecurrence): void {
  const values = recurrence.type === 'weekly' ? recurrence.daysOfWeek : recurrence.daysOfMonth;
  const [min, max] = recurrence.type === 'weekly' ? [0, 6] : [1, 31];
  if (
    values.length === 0 ||
    values.some((value) => !Number.isInteger(value) || value < min || value > max)
  ) {
    throw new DomainError('ROUTINE_RECURRENCE_INVALID', JSON.stringify(recurrence));
  }
}

function matches(date: DateKey, recurrence: RoutineRecurrence): boolean {
  return recurrence.type === 'weekly'
    ? recurrence.daysOfWeek.includes(dayOfWeekOf(date))
    : recurrence.daysOfMonth.includes(dayOfMonthOf(date));
}

/**
 * 시작일·종료일(둘 다 포함) 범위 안에서 반복 패턴에 맞는 날짜를 오름차순으로 전부 돌려준다.
 * 맞는 날짜가 하나도 없으면 빈 배열이다(그것 자체는 오류가 아니다 — 호출부가 안내한다).
 */
export function expandRoutineDates(input: {
  startDate: DateKey;
  endDate: DateKey;
  recurrence: RoutineRecurrence;
}): DateKey[] {
  const { startDate, endDate, recurrence } = input;
  if (!isValidDateKey(startDate) || !isValidDateKey(endDate) || endDate < startDate) {
    throw new DomainError('ROUTINE_DATE_RANGE_INVALID', `${startDate}~${endDate}`);
  }
  validateRecurrence(recurrence);

  const dates: DateKey[] = [];
  let cursor = startDate;
  // day 는 시작일을 0으로 세는 경과 일수다 — day 가 ROUTINE_MAX_SPAN_DAYS(366)에 이르면 이미
  // 367번째 날이라, 시작~종료 포함 총 일수가 상한을 넘은 시점이다(day+1 = 총 일수).
  for (let day = 0; cursor <= endDate; day += 1) {
    if (day >= ROUTINE_MAX_SPAN_DAYS) {
      throw new DomainError('ROUTINE_RANGE_TOO_LONG', `${startDate}~${endDate}`);
    }
    if (matches(cursor, recurrence)) {
      dates.push(cursor);
    }
    cursor = addCivilDays(cursor, 1);
  }
  return dates;
}
