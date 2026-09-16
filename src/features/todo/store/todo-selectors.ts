// 스토어 상태 → 화면이 그대로 쓰는 파생 값 (todo.md R7·R15). 순수 함수라 React 없이 단위 테스트한다.
//
// 정렬 규칙은 하나도 여기서 만들지 않는다 — 항목 배치는 `groupTodosForDisplay`(R7), 그룹 배치는
// `sortCategoriesForDisplay`(R15, 달성률 막대와 같은 함수)를 부른다. 규칙을 복제하면 본문 목록과
// 달성률이 조용히 갈린다.
//
// 반환값은 매번 새 배열이다. 훅은 참조가 안정적인 `byId` 만 구독하고 렌더 중에 이 함수를 부른다
// (code-style §3 "파생 값은 렌더 중 계산"). 200개/일 기준 재정렬 예산은 5ms 다(TECH_PLAN §8).
import type { Category } from '@/domain/category/category';
import { sortCategoriesForDisplay } from '@/domain/category/category.rules';
import type { CategoryId, TodoId } from '@/domain/ids';
import { isTombstone } from '@/domain/meta';
import { completionCounts, type CompletionCounts } from '@/domain/todo/completion-rate';
import { groupTodosForDisplay, sortTodos } from '@/domain/todo/ordering';
import type { Todo } from '@/domain/todo/todo';

import type { TodoSnapshot } from '@/features/todo/store/todo-state';

/** 한 카테고리 그룹의 화면 배치 (R7). 구분선·"완료 n" 은 `completed.length` 로 그린다. */
export type TodoGroup = {
  categoryId: CategoryId;
  /** 미완료 블록: `order` 오름차순(동률은 `createdAt` → `id`). */
  incomplete: Todo[];
  /** 완료 블록: `doneAt` 내림차순 — 방금 완료한 것이 구분선 바로 아래에 온다. */
  completed: Todo[];
  /** 그룹 헤더 우측의 완료/전체. */
  counts: CompletionCounts;
};

/** 메모리에 올라온 날짜의 투두 전부를 표준 정렬로 (R17). */
export function selectTodos(state: TodoSnapshot): Todo[] {
  return sortTodos(Object.values(state.byId));
}

/** 한 건. 편집 패널·메뉴가 대상 투두를 집을 때 쓴다. */
export function selectTodoById(state: TodoSnapshot, id: TodoId): Todo | undefined {
  return state.byId[id];
}

/** 그날 전체의 완료/전체 (completion-rate R1) — 헤더 링·탭 제목의 원천. */
export function selectCompletion(state: TodoSnapshot): CompletionCounts {
  return completionCounts(Object.values(state.byId));
}

/** 이미 뽑아 둔 목록에서 한 그룹을 만든다. `selectGroups` 가 목록을 한 번만 읽도록 분리했다. */
function buildGroup(categoryId: CategoryId, todos: readonly Todo[]): TodoGroup {
  const mine = todos.filter((todo) => todo.categoryId === categoryId);
  return { categoryId, ...groupTodosForDisplay(mine), counts: completionCounts(mine) };
}

/** 한 카테고리 그룹 (R7). 그 카테고리에 그날 투두가 없으면 두 블록 모두 빈 배열이다. */
export function selectGroup(state: TodoSnapshot, categoryId: CategoryId): TodoGroup {
  return buildGroup(categoryId, Object.values(state.byId));
}

/**
 * 화면에 그릴 그룹 목록 (R15): 활성 카테고리 `order` 오름차순 → 종료 카테고리(그날 투두가 있을 때만)
 * → 그 밖(삭제된 카테고리 등).
 *
 * 활성 카테고리는 투두가 없어도 남는다 — 빈 그룹의 `+ 할 일 추가` 행이 입력 시작점이기 때문이다(§2-C).
 * `categories` 에 없는 `categoryId` 는 맨 뒤에 `id` 오름차순으로 붙인다: 카테고리를 삭제하면
 * `categories.list()` 가 그 행을 더는 돌려주지 않는데, 남아 있는 완료 투두를 화면에서 지울 수는 없다
 * (R15 셋째 줄·category R17). 삭제된 카테고리의 이름·색까지 보여야 하면 호출부가 `dataset.readAll()` 의
 * 카테고리 전량(툼스톤 포함)을 넘긴다 — `sortCategoriesForDisplay` 가 그때 툼스톤을 맨 뒤로 놓는다.
 */
export function selectGroups(state: TodoSnapshot, categories: readonly Category[]): TodoGroup[] {
  const todos = Object.values(state.byId);
  const present = new Set<CategoryId>(todos.map((todo) => todo.categoryId));
  const known = sortCategoriesForDisplay(categories).filter(
    (category) =>
      (category.status === 'active' && !isTombstone(category)) || present.has(category.id),
  );
  const knownIds = new Set<CategoryId>(categories.map((category) => category.id));
  const unknown = [...present]
    .filter((id) => !knownIds.has(id))
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return [...known.map((category) => category.id), ...unknown].map((categoryId) =>
    buildGroup(categoryId, todos),
  );
}
