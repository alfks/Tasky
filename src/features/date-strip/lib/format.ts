// 날짜 표기·접근성 이름 (date-strip.md R9·R11). 순수 함수만 둔다.
//
// `Intl.DateTimeFormat` 을 쓰지 않는 이유: 표기가 R11 로 고정('YYYY년 M월', 0 채움 없는 'D', 한 글자 요일)이라
// 로케일에 따라 흔들리면 안 되고, 로케일 데이터가 없는 런타임에서도 같은 문자열이 나와야 하기 때문이다.
import type { DateKey } from '@/domain/date/date-key';

import { fromDateKey } from '@/lib/date';

/** 월요일 시작 요일 한 글자 (R11). 인덱스 0 = 월요일. */
export const WEEKDAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'] as const;

/** 토요일의 월요일 시작 인덱스. 요일 색(R9)에 쓴다. */
export const SATURDAY_INDEX = 5;
/** 일요일의 월요일 시작 인덱스. */
export const SUNDAY_INDEX = 6;

/** `date` 의 요일을 월요일 시작 인덱스(0=월 … 6=일)로 (R1·R9). */
export function weekdayIndex(date: DateKey): number {
  return (fromDateKey(date).getDay() + 6) % 7;
}

/** 'YYYY-MM-DD' 를 숫자 셋으로. 문자열을 그대로 쪼개므로 타임존의 영향을 받지 않는다. */
function parts(date: DateKey): { year: number; month: number; day: number } {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month, day };
}

/** 월 표시 'YYYY년 M월' (R11). */
export function formatMonthLabel(date: DateKey): string {
  const { year, month } = parts(date);
  return `${year}년 ${month}월`;
}

/** 좁은 화면(§2-B)의 월 표시 'M월'. */
export function formatShortMonthLabel(date: DateKey): string {
  return `${parts(date).month}월`;
}

/** 셀에 찍는 날짜 숫자. 0 채움 없음 (R11). */
export function formatDayNumber(date: DateKey): string {
  return String(parts(date).day);
}

/** 셀 접근성 이름의 앞부분 'M월 D일 요일' (R11). */
export function formatDateName(date: DateKey): string {
  const { month, day } = parts(date);
  return `${month}월 ${day}일 ${WEEKDAY_LABELS[weekdayIndex(date)]}요일`;
}

/** 셀 접근성 이름에 덧붙이는 진행 문구 (§5). 투두가 없으면 붙이지 않는다(빈 상태 문구 없음 — §2-C). */
export function formatProgressName(total: number, doneCount: number): string | undefined {
  if (total === 0) return undefined;
  return `할 일 ${total}개 중 ${doneCount}개 완료`;
}

/**
 * 셀의 접근 가능한 이름 전체 (R11·§5). 예: '9월 17일 목요일, 오늘, 할 일 3개 중 2개 완료'.
 *
 * '선택됨' 은 이름에 넣지 않는다. 셀은 `role="radio" aria-checked` 라 스크린리더가 선택 상태를
 * 이미 읽어 주고, 이름에 또 넣으면 화살표로 한 칸 지날 때마다 "선택됨"을 두 번 듣게 된다(실측 확인).
 * 반면 '오늘' 은 대응하는 ARIA 상태가 없어 이름이 유일한 통로이므로 남긴다.
 */
export function formatCellName(input: {
  date: DateKey;
  isToday: boolean;
  progress?: string;
}): string {
  const segments = [formatDateName(input.date)];
  if (input.isToday) segments.push('오늘');
  if (input.progress !== undefined) segments.push(input.progress);
  return segments.join(', ');
}
