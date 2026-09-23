// 달성률 계산 (completion-rate.md R1·R2·R5, R8).
//
// **세는 일은 `completionCounts` 하나뿐이다.** 헤더 링·탭 제목은 이 파일을 직접 부르고, 날짜 스트립
// ✓ 배지는 `day-summary.ts` 의 `summarizeDays` 를 부르지만 그쪽의 `total`·`doneCount` 도 결국
// `completionCounts` 의 결과다 — 진입점이 둘이어도 계산은 하나라는 뜻이고, 그 불변식은
// `completion-invariant.test.ts` 가 고정한다(R8).
//
// **불변식은 "같은 목록을 넣었을 때" 성립한다.** 화면의 두 값이 늘 같다는 뜻은 아니다 — 스트립은
// 주가 바뀔 때만 저장소를 읽어 토글 직후 낡은 값이 남는다(R8 하위 항목). 무효화는 T-56 소관.
//
// 조회가 이미 툼스톤을 제외하므로 여기서 `deletedAt` 을 다시 보지 않는다 (ADR-0007 결정 4).
import type { Category } from '@/domain/category/category';
import { sortCategoriesForDisplay } from '@/domain/category/category.rules';
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
export function percentFromCounts({ done, total }: CompletionCounts): number | null {
  if (total === 0) {
    return null;
  }
  if (done === total) {
    return 100;
  }
  return Math.min(99, Math.round((done / total) * 100));
}

/** {@link percentFromCounts} 를 `todos` 에서 바로 센다 — 세는 일 자체는 `completionCounts` 하나뿐이다. */
export function completionPercent(todos: readonly Todo[]): number | null {
  return percentFromCounts(completionCounts(todos));
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

// **`summarizeWeek` 은 여기 없다.** 원래 날짜별 `{done, total, categoryIds}` 를 모으는 같은 이름의
// 함수가 있었지만, 같은 계산(날짜별 버킷팅 + 완료 수 + 그날 등장한 카테고리)을 `day-summary.ts` 의
// `summarizeDays` 가 이미 하고 있었다 — 그쪽은 카테고리 순서·점 규칙(date-strip R7)까지 지키고, 날짜
// 스트립(`useWeekSummaries`)과 달성률이 실제로 부르는 것도 그쪽 하나다. 둘을 남겨 두면 R8 의 "같은
// 목록을 같은 방식으로 센다" 가 이름만 참이 된다. 날짜 범위 요약이 필요하면 `summarizeDays(days, …)` 를
// 쓴다(TECH_PLAN §12 의 `summarizeRange` 확장도 그쪽에서 이어 간다).
