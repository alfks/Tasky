// 문서 제목 (app-shell.md R9). 일반 상태의 제목은 항상 앱 이름이고, 타이머가 실행 중이면
// timer feature 가 이 값 **앞에** 남은 시간과 투두 제목을 붙인다(timer R11).
import type { DateKey } from '@/domain/date/date-key';

import { fromDateKey } from '@/lib/date';

export const APP_NAME = 'Tasky';

/** 일요일 시작(= `Date.getDay()`) 요일 한 글자. */
const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'] as const;

/** 제목 한 날짜분: `9월 17일 (목)`. `Intl` 을 쓰지 않는 이유는 date-strip/lib/format.ts 와 같다. */
export function titleDateLabel(date: DateKey): string {
  const at = fromDateKey(date);
  return `${at.getMonth() + 1}월 ${at.getDate()}일 (${WEEKDAYS[at.getDay()]})`;
}

/** 날짜·달성률은 화면에만 표시하고, 일반 상태의 브라우저 탭은 앱 이름으로 고정한다. */
export function shellDocumentTitle(
  _date: DateKey,
  _counts: { done: number; total: number },
): string {
  return APP_NAME;
}
