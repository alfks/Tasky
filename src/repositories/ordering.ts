// 계약이 고정하는 정렬 중 **도메인에 자리가 없는 것**만 둔다. 두 구현(memory·indexeddb)이 같은 함수를
// 쓰므로 순서가 갈릴 수 없고, 계약 테스트는 이 함수들이 만든 순서를 그대로 단언한다.
//
// 투두의 표준 정렬(`order` → `createdAt` → `id`)과 카테고리 정렬은 도메인에 이미 있다
// (`@/domain/todo/ordering`, `@/domain/category/category.rules`) — 여기서 복제하지 않는다.
import type { FocusSession } from '@/domain/focus/focus-session';
import { compareTodos } from '@/domain/todo/ordering';
import type { Todo } from '@/domain/todo/todo';

/** 집중 세션 정렬: `startedAt` asc → `createdAt` asc → `id` asc. 동률이 남지 않는다. */
export function compareFocusSessions(a: FocusSession, b: FocusSession): number {
  if (a.startedAt !== b.startedAt) {
    return a.startedAt < b.startedAt ? -1 : 1;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 검색 결과 정렬 (shortcuts R9): `date` 내림차순 → 미완료 우선 → 표준 정렬. */
export function compareSearchResults(a: Todo, b: Todo): number {
  if (a.date !== b.date) {
    return a.date < b.date ? 1 : -1;
  }
  if (a.done !== b.done) {
    return a.done ? 1 : -1;
  }
  return compareTodos(a, b);
}

/** 제목 부분 일치(대소문자 무시). 메모는 보지 않는다 (shortcuts R9). */
export function matchesTodoQuery(todo: Todo, query: string): boolean {
  return todo.title.toLowerCase().includes(query.trim().toLowerCase());
}
