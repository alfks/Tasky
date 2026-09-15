// 투두 정렬·재매김 규칙 (todo.md R7·R11·R15).
//
// 정렬은 **항상 3단계**(`order` → `createdAt` → `id`)다. 동률을 남기지 않는 이유는 memory·indexeddb 두
// 레포지토리 구현이 같은 순서를 내야 하기 때문이다(TECH_PLAN §6 — 계약 테스트가 이 문장을 단언한다).
// 삽입 순서에 의존하는 안정 정렬에 기대면 두 구현이 갈린다.
import { DomainError } from '@/domain/errors';
import type { TodoId } from '@/domain/ids';
import { touch, type MetaDeps, type Persistable } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

/** 그룹 안의 표준 정렬: `order` 오름차순 → `createdAt` 오름차순 → `id` 오름차순. 동률이 남지 않는다. */
export function compareTodos(a: Todo, b: Todo): number {
  if (a.order !== b.order) {
    return a.order - b.order;
  }
  if (a.createdAt !== b.createdAt) {
    return a.createdAt < b.createdAt ? -1 : 1;
  }
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** 원본을 건드리지 않고 표준 정렬한 새 배열. */
export function sortTodos(todos: readonly Todo[]): Todo[] {
  return [...todos].sort(compareTodos);
}

/** 완료 블록 정렬: `doneAt` 내림차순(방금 완료한 것이 위) → 동률이면 표준 정렬 (todo R7). */
export function compareDoneTodos(a: Todo, b: Todo): number {
  const at = a.doneAt ?? a.updatedAt;
  const bt = b.doneAt ?? b.updatedAt;
  if (at !== bt) {
    return at < bt ? 1 : -1;
  }
  return compareTodos(a, b);
}

/** 한 그룹(같은 날짜·카테고리)의 화면 배치 (todo R7): 미완료 블록 → 구분선 → 완료 블록. */
export function groupTodosForDisplay(todos: readonly Todo[]): {
  incomplete: Todo[];
  completed: Todo[];
} {
  return {
    incomplete: todos.filter((t) => !t.done).sort(compareTodos),
    completed: todos.filter((t) => t.done).sort(compareDoneTodos),
  };
}

/** 같은 날짜·카테고리에 속한 투두만 고른다. */
export function todosInGroup(
  todos: readonly Todo[],
  date: Todo['date'],
  categoryId: Todo['categoryId'],
): Todo[] {
  return todos.filter((t) => t.date === date && t.categoryId === categoryId);
}

/** 그룹 끝에 붙일 `order` — 그룹이 비어 있으면 0 (todo R5·R10·R12). */
export function nextTodoOrder(groupTodos: readonly Todo[]): number {
  return groupTodos.reduce((max, t) => Math.max(max, t.order), -1) + 1;
}

/** 재매김 결과 중 실제로 `order` 가 달라진 것만 `touch` 해서 돌려준다. */
function renumber(sequence: readonly Todo[], deps: MetaDeps): Persistable<Todo>[] {
  const at = deps.now();
  const changed: Persistable<Todo>[] = [];
  sequence.forEach((todo, index) => {
    if (todo.order !== index) {
      changed.push(touch({ ...todo, order: index }, at));
    }
  });
  return changed;
}

/**
 * 그룹 안에서 미완료 투두 하나를 `targetIndex` 자리로 옮기고 **전체를 0..n-1 로 재매김**한다 (todo R11).
 *
 * 완료 항목을 포함한 수열 전체를 재매김하므로 완료 항목의 상대 위치가 보존되고, 체크를 해제하면
 * 원래 자리로 돌아온다. 반환값은 `order` 가 달라진 투두뿐이라 한 번에 저장하면 된다.
 */
export function reorderTodos(
  groupTodos: readonly Todo[],
  todoId: TodoId,
  targetIndex: number,
  deps: MetaDeps,
): Persistable<Todo>[] {
  const sequence = sortTodos(groupTodos);
  const from = sequence.findIndex((t) => t.id === todoId);
  if (from === -1) {
    throw new DomainError('TODO_NOT_IN_GROUP', todoId);
  }
  if (sequence[from].done) {
    throw new DomainError('TODO_REORDER_DONE', todoId);
  }
  const to = Math.min(Math.max(targetIndex, 0), sequence.length - 1);
  const [moved] = sequence.splice(from, 1);
  sequence.splice(to, 0, moved);
  return renumber(sequence, deps);
}

/**
 * `Alt+↑/↓`·메뉴 "위로/아래로" (todo R11). 완료 항목은 화면의 미완료 블록에 없으므로 **가장 가까운
 * 미완료 이웃**을 건너뛸 자리로 삼는다 — 그래야 화면에서 정확히 한 칸 움직이고 완료 항목은 제자리에 남는다.
 * 더 이동할 이웃이 없으면 아무것도 바꾸지 않는다(빈 배열).
 */
export function moveTodoBy(
  groupTodos: readonly Todo[],
  todoId: TodoId,
  direction: -1 | 1,
  deps: MetaDeps,
): Persistable<Todo>[] {
  const sequence = sortTodos(groupTodos);
  const from = sequence.findIndex((t) => t.id === todoId);
  if (from === -1) {
    throw new DomainError('TODO_NOT_IN_GROUP', todoId);
  }
  if (sequence[from].done) {
    throw new DomainError('TODO_REORDER_DONE', todoId);
  }
  let target = -1;
  for (let i = from + direction; i >= 0 && i < sequence.length; i += direction) {
    if (!sequence[i].done) {
      target = i;
      break;
    }
  }
  return target === -1 ? [] : reorderTodos(sequence, todoId, target, deps);
}
