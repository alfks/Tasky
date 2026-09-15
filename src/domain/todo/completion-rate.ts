// 달성률 계산 (completion-rate.md R1·R2·R5, R8). 헤더 링·탭 제목·날짜 스트립 배지는 **전부 이 함수들의 결과**다.
// 조회가 이미 툼스톤을 제외하므로 여기서 `deletedAt` 을 다시 보지 않는다 (ADR-0007 결정 4).
import type { Category } from '@/domain/category/category';
import { sortCategoriesForDisplay } from '@/domain/category/category.rules';
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId } from '@/domain/ids';
import type { Todo } from '@/domain/todo/todo';

/** 완료/전체 쌍. `total` 은 카테고리 상태와 무관하게 그날의 모든 투두다 (R1). */
export type CompletionCounts = { done: number; total: number };

/** 카테고리별 요약 한 줄 (R5). */
export type CategoryCompletion = CompletionCounts & { categoryId: CategoryId };

/** 그날의 완료/전체. */
export function completionCounts(todos: readonly Todo[]): CompletionCounts {
  return { done: todos.filter((t) => t.done).length, total: todos.length };
}

/** `done / total`. 투두가 0개면 비율이 정의되지 않아 `null` 이다 — 화면은 `—` 를 쓴다 (R1). */
export function completionRate(todos: readonly Todo[]): number | null {
  const { done, total } = completionCounts(todos);
  return total === 0 ? null : done / total;
}

/**
 * 표시용 퍼센트 (R2). `done === total` 일 때만 100 이고, 반올림이 100 이 되는 경우(199/200)는 99 로 낮춘다.
 * 링 각도는 이 값이 아니라 `completionRate` 의 반올림 전 값으로 그린다 (R3).
 */
export function completionPercent(todos: readonly Todo[]): number | null {
  const { done, total } = completionCounts(todos);
  if (total === 0) {
    return null;
  }
  if (done === total) {
    return 100;
  }
  return Math.min(99, Math.round((done / total) * 100));
}

/**
 * 카테고리별 막대 데이터 (R5). **그날 투두가 있는 카테고리만** 나온다.
 * `categories` 에 없는 `categoryId`(스냅샷이 아직 안 온 경우)는 맨 뒤에 id 순으로 붙인다 — 숫자가 사라지지 않게.
 */
export function summarizeByCategory(
  todos: readonly Todo[],
  categories: readonly Category[],
): CategoryCompletion[] {
  const buckets = new Map<CategoryId, CompletionCounts>();
  for (const todo of todos) {
    const bucket = buckets.get(todo.categoryId) ?? { done: 0, total: 0 };
    buckets.set(todo.categoryId, {
      done: bucket.done + (todo.done ? 1 : 0),
      total: bucket.total + 1,
    });
  }
  // 순서 규칙(R5)은 `sortCategoriesForDisplay` 하나뿐이다 — 본문 그룹(todo R15)과 같은 함수다.
  const known = sortCategoriesForDisplay(categories).flatMap((c) => {
    const counts = buckets.get(c.id);
    return counts === undefined ? [] : [{ categoryId: c.id, ...counts }];
  });
  const knownIds = new Set(categories.map((c) => c.id));
  const unknown = [...buckets.entries()]
    .filter(([id]) => !knownIds.has(id))
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, counts]) => ({ categoryId: id, ...counts }));
  return [...known, ...unknown];
}

/** 날짜 스트립 배지·점의 원천 (date-strip R8, completion-rate R8): 날짜별 완료/전체 + 그날 등장한 카테고리. */
export function summarizeWeek(
  todos: readonly Todo[],
): Map<DateKey, CompletionCounts & { categoryIds: CategoryId[] }> {
  const byDate = new Map<DateKey, CompletionCounts & { categoryIds: CategoryId[] }>();
  for (const todo of todos) {
    const entry = byDate.get(todo.date) ?? { done: 0, total: 0, categoryIds: [] };
    if (!entry.categoryIds.includes(todo.categoryId)) {
      entry.categoryIds.push(todo.categoryId);
    }
    byDate.set(todo.date, {
      done: entry.done + (todo.done ? 1 : 0),
      total: entry.total + 1,
      categoryIds: entry.categoryIds,
    });
  }
  return byDate;
}
