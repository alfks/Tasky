// 날짜별 요약(카테고리 색 점·완료 배지) 계산 (date-strip.md R7·R8, §4). 순수 함수만 둔다.
import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId } from '@/domain/ids';
import type { Todo } from '@/domain/todo/todo';

/** 셀에 찍는 점의 최대 개수. 넘치면 '+n' 텍스트가 대신한다 (R7). */
export const MAX_DOTS = 3;

/**
 * 삭제된(툼스톤) 카테고리의 점 색.
 *
 * R7 은 "삭제됨" 카테고리도 점으로 세라고 하지만, 엔티티 저장소는 툼스톤을 반환하지 않으므로
 * (ADR-0007 결정 4) 그 카테고리의 실제 색을 스트립 렌더 경로에서는 알 수 없다. 툼스톤을 읽는
 * 유일한 통로인 `DatasetRepository.readAll()` 은 백업용 전량 읽기라 주 단위 요약에 쓰지 않는다.
 * 그래서 색은 잃고 **개수는 잃지 않는** 쪽을 택해 중립색으로 그린다. 한계는 여기 적어 둔다.
 */
export const DELETED_CATEGORY_COLOR = 'var(--color-faint)';

/** 한 날짜의 요약. 점·배지는 장식이고(aria-hidden) 수치는 접근성 이름으로 따로 나간다(§5). */
export type DaySummary = {
  /** 그 날 삭제되지 않은 투두 수. */
  total: number;
  /** 그중 완료 수. */
  doneCount: number;
  /** ✓ 배지 조건: 투두가 1개 이상이고 전부 완료 (R8). */
  isAllDone: boolean;
  /** 점. R7 순서로 최대 `MAX_DOTS` 개. 카테고리 id 를 함께 들고 있어 키가 안정적이다. */
  dots: { categoryId: CategoryId; color: string }[];
  /** 점으로 못 그린 카테고리 수. 0 이면 '+n' 을 그리지 않는다 (R7). */
  overflowCount: number;
};

/** 카테고리 순서(활성 `order` → 종료)를 저장소가 준 배열 순서 그대로 색 조회표로 만든다 (R7). */
function indexCategories(categories: Category[]): Map<CategoryId, { rank: number; color: string }> {
  return new Map(categories.map((c, rank) => [c.id, { rank, color: c.color }]));
}

/** 한 날짜의 투두 목록을 요약으로 (R7·R8). */
export function summarizeDay(
  todos: Todo[],
  index: Map<CategoryId, { rank: number; color: string }>,
): DaySummary {
  const seen = new Map<CategoryId, { rank: number; color: string }>();
  let doneCount = 0;
  for (const todo of todos) {
    if (todo.done) doneCount += 1;
    if (seen.has(todo.categoryId)) continue;
    // 저장소가 모르는 카테고리 = 삭제됨. R7 의 '삭제됨' 묶음이 맨 뒤에 오도록 rank 를 최대로 준다.
    seen.set(
      todo.categoryId,
      index.get(todo.categoryId) ?? {
        rank: Number.MAX_SAFE_INTEGER,
        color: DELETED_CATEGORY_COLOR,
      },
    );
  }
  const ordered = [...seen].sort(([, a], [, b]) => a.rank - b.rank);
  return {
    total: todos.length,
    doneCount,
    isAllDone: todos.length > 0 && doneCount === todos.length,
    dots: ordered
      .slice(0, MAX_DOTS)
      .map(([categoryId, entry]) => ({ categoryId, color: entry.color })),
    overflowCount: Math.max(0, ordered.length - MAX_DOTS),
  };
}

/** 주 7일치 요약. `todos` 는 그 주 범위 조회 결과, `categories` 는 활성+종료 순서 배열이다 (§4). */
export function summarizeWeek(
  days: DateKey[],
  todos: Todo[],
  categories: Category[],
): Map<DateKey, DaySummary> {
  const index = indexCategories(categories);
  const byDate = new Map<DateKey, Todo[]>(days.map((day) => [day, []]));
  for (const todo of todos) {
    byDate.get(todo.date)?.push(todo);
  }
  return new Map([...byDate].map(([day, list]) => [day, summarizeDay(list, index)]));
}
