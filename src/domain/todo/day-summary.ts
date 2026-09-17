// 날짜별 요약(카테고리 색 점·완료 배지)의 순수 계산 (date-strip.md §4·R7·R8).
//
// 스펙 §4 가 "요약은 도메인 순수 함수"로 못박은 지점이다. 날짜 스트립 말고도 같은 계산이 필요한
// 화면(달성률·통계)이 있어 feature 안에 두면 구현이 갈라진다 — 그래서 여기 있다.
import type { Category } from '@/domain/category/category';
import { sortCategoriesForDisplay } from '@/domain/category/category.rules';
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId } from '@/domain/ids';
import { completionCounts } from '@/domain/todo/completion-rate';
import type { Todo } from '@/domain/todo/todo';

/** 셀에 찍는 점의 최대 개수. 넘치면 '+n' 텍스트가 대신한다 (R7). */
export const MAX_DOTS = 3;

/** 점 하나. `categoryId` 를 함께 들고 있어 렌더 키가 안정적이다. */
export type CategoryDot = { categoryId: CategoryId; color: string };

/** 한 날짜의 요약. 점·배지는 장식이고(aria-hidden) 수치는 접근성 이름으로 따로 나간다 (date-strip §5). */
export type DaySummary = {
  /** 그 날 삭제되지 않은 투두 수. */
  total: number;
  /** 그중 완료 수. */
  doneCount: number;
  /** ✓ 배지 조건: 투두가 1개 이상이고 전부 완료 (R8). */
  isAllDone: boolean;
  /** 점. R7 순서로 최대 `MAX_DOTS` 개. */
  dots: CategoryDot[];
  /** 점으로 못 그린 카테고리 수. 0 이면 '+n' 을 그리지 않는다 (R7). */
  overflowCount: number;
};

/** 카테고리 순서(활성 `order` → 종료)와 색의 조회표 (R7). */
export type CategoryDotIndex = ReadonlyMap<CategoryId, { rank: number; color: string }>;

/**
 * 조회표를 만든다 (R7). 순서는 저장소가 준 배열이 아니라 `sortCategoriesForDisplay` 가 정한다 —
 * 순서 규칙이 도메인 한 곳에만 있어야 본문 그룹·통계와 어긋나지 않는다.
 */
export function indexCategoryDots(categories: readonly Category[]): CategoryDotIndex {
  return new Map(
    sortCategoriesForDisplay(categories).map((category, rank) => [
      category.id,
      { rank, color: category.color },
    ]),
  );
}

/**
 * 한 날짜의 투두 목록을 요약으로 (R7·R8).
 *
 * 조회표에 없는 카테고리는 **점을 만들지 않고 넘침으로도 세지 않는다.** 색을 모르는 상태에서
 * 중립색 점을 찍으면 대비 1.97:1 로 사실상 보이지 않으면서 최대 3개뿐인 자리를 먹어 보이는
 * 카테고리를 밀어낸다. 그 날의 개수는 `total`·`doneCount` 에 그대로 남아 셀 접근성 이름
 * ("할 일 N개 중 M개 완료")으로 전달된다.
 *
 * **"조회표에 없다" 가 곧 "삭제됐다" 는 아니다.** 예전에는 그랬지만, `CategoryRepository.listDeletedByIds`
 * (ADR-0014)가 생긴 뒤로 삭제된 카테고리도 색을 달고 `categories` 에 실려 들어온다 — 날짜 스트립은
 * `useWeekSummaries` 가 살아 있는 목록에서 못 찾은 id 만 모아 한 번 더 물어 채운다. 그래서 여기서
 * 조회표에 없는 id 는 "호출부가 색을 끝내 찾지 못한 것"(예: 툼스톤 조회를 하지 않는 호출부, 또는
 * 그 조회로도 안 나오는 id)이고, 그 경우에만 위 규칙이 적용된다.
 */
export function summarizeDay(todos: readonly Todo[], index: CategoryDotIndex): DaySummary {
  // **세는 일은 `completionCounts` 하나가 한다** (completion-rate R8). 전에는 여기서 따로 셌고 값이
  // 우연히 같았을 뿐이라 갈라져도 아무 테스트가 죽지 않았다. 이 위임이 "같은 목록을 같은 방식으로
  // 센다" 를 구조로 만든 지점이고, 두 경로가 다시 갈리면 `completion-invariant.test.ts` 가 죽는다.
  const { done, total } = completionCounts(todos);
  const seen = new Map<CategoryId, { rank: number; color: string }>();
  for (const todo of todos) {
    const entry = index.get(todo.categoryId);
    if (entry === undefined || seen.has(todo.categoryId)) continue;
    seen.set(todo.categoryId, entry);
  }
  const ordered = [...seen].sort(([, a], [, b]) => a.rank - b.rank);
  return {
    total,
    doneCount: done,
    // `completionRate(todos) === 1` 과 같은 조건이다(0개면 `null`, 나눗셈 없이 같은 판정).
    isAllDone: total > 0 && done === total,
    dots: ordered
      .slice(0, MAX_DOTS)
      .map(([categoryId, entry]) => ({ categoryId, color: entry.color })),
    overflowCount: Math.max(0, ordered.length - MAX_DOTS),
  };
}

/**
 * 여러 날짜의 요약을 한 번에 (§4). `days` 에 없는 날짜의 투두는 버리고, 투두가 없는 날도 빈 요약으로 남긴다
 * — 호출부가 `days` 와 같은 길이의 결과를 기대할 수 있게.
 */
export function summarizeDays(
  days: readonly DateKey[],
  todos: readonly Todo[],
  categories: readonly Category[],
): Map<DateKey, DaySummary> {
  const index = indexCategoryDots(categories);
  const byDate = new Map<DateKey, Todo[]>(days.map((day) => [day, []]));
  for (const todo of todos) {
    byDate.get(todo.date)?.push(todo);
  }
  return new Map([...byDate].map(([day, list]) => [day, summarizeDay(list, index)]));
}
