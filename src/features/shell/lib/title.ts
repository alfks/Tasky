// 문서 제목 (app-shell.md R9). 일반 상태의 제목은 항상 앱 이름이고, 타이머가 실행 중이면
// timer feature 가 이 값 **앞에** 남은 시간과 투두 제목을 붙인다(timer R11).
import type { DateKey } from '@/domain/date/date-key';

import { formatDateFieldLabel } from '@/features/date-strip';

export const APP_NAME = 'Tasky';

/**
 * 제목 한 날짜분: `9월 17일 (목)`. 표기의 단일 소스는 date-strip 의 `formatDateFieldLabel` 이다 —
 * 편집 패널의 날짜 버튼과 같은 글자여야 하고(todo.md §2-A), 요일 글자도 한 곳(`WEEKDAY_LABELS`)에서 온다.
 */
export function titleDateLabel(date: DateKey): string {
  return formatDateFieldLabel(date);
}

/** 날짜·달성률은 화면에만 표시하고, 일반 상태의 브라우저 탭은 앱 이름으로 고정한다. */
export function shellDocumentTitle(
  _date: DateKey,
  _counts: { done: number; total: number },
): string {
  return APP_NAME;
}
