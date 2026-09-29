// 루틴 순서(routine.md R13) — 관리 화면의 순서 변경과 그것이 **이미 만들어진 인스턴스**에 미치는 재매김.
//
// `routine.rules.ts` 가 아니라 따로 두는 이유: 저 파일은 저장소 두 구현이 정렬(`compareRoutines`)만
// 필요해 끌어가는 곳이라, 투두(`Todo`)까지 아는 이 재매김 코드를 섞으면 저장소 청크가 투두 정렬까지
// 끌고 간다. 여기는 스토어(`todo-routine-manage.ts#reorderRoutine`)만 정적으로 import 한다 — 동적
// `import()` 로 떼지 않는 이유는 `RoutineManager.tsx` 머리 주석(청크 경계가 오히려 비싸다, 실측).
import { DomainError } from '@/domain/errors';
import type { RoutineId } from '@/domain/ids';
import { touch, type MetaDeps, type Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { compareRoutines } from '@/domain/routine/routine.rules';
import { compareTodos } from '@/domain/todo/ordering';
import type { Todo } from '@/domain/todo/todo';

/** 루틴 id → 순위(0부터). `routineRank` 가 만든다. */
export type RoutineRank = ReadonlyMap<string, number>;

/**
 * 목록 안에서 루틴 하나를 `targetIndex` 자리로 옮기고 **전체를 0..n-1 로 재매김**한다(R13).
 * `order` 가 없던 옛 레코드도 이때 전부 값을 받는다. 바뀐 것만 돌려주므로 한 트랜잭션에 실으면 된다.
 * 범위 밖 인덱스는 양끝으로 자른다(카테고리 `reorderCategories` 와 같은 계약).
 */
export function reorderRoutines(
  routines: readonly Routine[],
  routineId: RoutineId,
  targetIndex: number,
  deps: MetaDeps,
): Persistable<Routine>[] {
  const sequence = [...routines].sort(compareRoutines);
  const from = sequence.findIndex((routine) => routine.id === routineId);
  if (from === -1) {
    throw new DomainError('ROUTINE_NOT_IN_LIST', routineId);
  }
  const to = Math.min(Math.max(targetIndex, 0), sequence.length - 1);
  const [moved] = sequence.splice(from, 1);
  sequence.splice(to, 0, moved);
  const at = deps.now();
  const changed: Persistable<Routine>[] = [];
  sequence.forEach((routine, index) => {
    if (routine.order !== index) {
      changed.push(touch({ ...routine, order: index }, at));
    }
  });
  return changed;
}

/** 목록의 표준 정렬 순서 그대로 순위를 매긴다 — `applyRoutineRank` 가 받는 형태. */
export function routineRank(routines: readonly Routine[]): RoutineRank {
  return new Map([...routines].sort(compareRoutines).map((routine, index) => [routine.id, index]));
}

function rankOf(todo: Todo, rank: RoutineRank): number {
  return todo.routineId === undefined ? Infinity : (rank.get(todo.routineId) ?? Infinity);
}

/**
 * 한 그룹(같은 날짜·카테고리)의 **미완료 루틴 인스턴스**들을 루틴 순위대로 다시 놓는다(R13).
 *
 * 인스턴스들이 지금 차지한 `order` 자리(슬롯)의 **집합은 그대로** 두고 누가 어느 슬롯에 앉는지만
 * 바꾼다 — 손으로 옮긴 일반 투두·완료 항목은 자리도 값도 건드리지 않는다. 이미 순위대로면 빈 배열.
 * 인스턴스가 하나뿐이면 바꿀 것이 없다.
 */
export function applyRoutineRank(
  groupTodos: readonly Todo[],
  rank: RoutineRank,
  deps: MetaDeps,
): Persistable<Todo>[] {
  const instances = groupTodos
    .filter((todo) => !todo.done && todo.routineId !== undefined && rank.has(todo.routineId))
    .sort(compareTodos);
  if (instances.length < 2) {
    return [];
  }
  const slots = instances.map((todo) => todo.order);
  const ranked = [...instances].sort((a, b) => {
    const diff = rankOf(a, rank) - rankOf(b, rank);
    return diff !== 0 ? diff : compareTodos(a, b);
  });
  const at = deps.now();
  const changed: Persistable<Todo>[] = [];
  ranked.forEach((todo, index) => {
    if (todo.order !== slots[index]) {
      changed.push(touch({ ...todo, order: slots[index] }, at));
    }
  });
  return changed;
}

/**
 * 여러 날짜·카테고리가 섞인 투두 목록을 `(date, categoryId)` 그룹으로 나눠 각각 `applyRoutineRank`
 * 를 적용한다. 그룹끼리는 서로 독립이다 — 한 카테고리의 슬롯이 다른 카테고리로 새지 않는다.
 * 호출부(스토어)가 넘기는 목록은 `today` 이후 구간이라 과거 날짜는 애초에 여기 오지 않는다.
 */
export function rankRoutineInstances(
  todos: readonly Todo[],
  rank: RoutineRank,
  deps: MetaDeps,
): Persistable<Todo>[] {
  const groups = new Map<string, Todo[]>();
  for (const todo of todos) {
    const key = `${todo.date}\u0000${todo.categoryId}`;
    const group = groups.get(key);
    if (group === undefined) {
      groups.set(key, [todo]);
    } else {
      group.push(todo);
    }
  }
  return [...groups.values()].flatMap((group) => applyRoutineRank(group, rank, deps));
}
