// 문서 제목 (app-shell.md R9). 타이머가 실행 중이면 타이머 feature 가 이 값 **앞에** 남은 시간과
// 투두 제목을 붙인다(timer R11) — 그래서 여기서는 타이머를 모른다.
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

/**
 * R9 그대로. 투두가 0개면 비율 칸을 **통째로 뺀다** — `0/0` 은 "아무것도 안 했다" 로 읽힌다.
 * 비율은 달성률 훅이 준 수를 그대로 쓴다(R8: 링·제목·배지는 같은 함수의 결과).
 */
export function shellDocumentTitle(date: DateKey, counts: { done: number; total: number }): string {
  const parts =
    counts.total === 0
      ? [titleDateLabel(date), APP_NAME]
      : [titleDateLabel(date), `${counts.done}/${counts.total}`, APP_NAME];
  return parts.join(' · ');
}
