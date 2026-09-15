// 카테고리 삭제(category R13·R14·R14-a)와 되돌리기(R15)의 **계획**. 저장소는 실행만 한다.
//
// 이 파일이 지키는 계약(TECH_PLAN §6 — 계약 테스트가 이 문장들을 그대로 단언한다):
//  · `deps.now()` 를 **한 번만** 불러 카테고리 툼스톤·이동·삭제 투두가 전부 같은 시각을 쓴다(R14 "같은 deletedAt").
//  · "미완료" = `done === false`. 조회가 이미 툼스톤을 제외하므로 `deletedAt` 재판정은 하지 않는다.
//  · **완료 투두는 writes 에 들어가지 않는다** — 한 필드도 건드리지 않는다(R14).
//  · 이동 `order` 는 날짜별 `base(d) = max(대상 그룹의 그 날짜 order, -1) + 1` 부터, 원래 정렬 순서
//    (`order` → `createdAt` → `id`)를 유지한 채 연속 번호. 동률이 남지 않아 memory·indexeddb 결과가 같다(R14-a).
import type { Category } from '@/domain/category/category';
import { createCategory } from '@/domain/category/category.rules';
import type { DatasetWrite } from '@/domain/dataset';
import type { DateKey } from '@/domain/date/date-key';
import { DomainError } from '@/domain/errors';
import type { CategoryId, TodoId } from '@/domain/ids';
import {
  deletionStamp,
  markDeleted,
  touch,
  type Meta,
  type MetaDeps,
  type Persistable,
} from '@/domain/meta';
import { nextTodoOrder, sortTodos } from '@/domain/todo/ordering';
import type { Todo } from '@/domain/todo/todo';

/** 미완료 투두를 어떻게 할지 (category R10). 기본값은 ①, 대상이 없으면 ②다 — 그 판정은 UI 가 한다. */
export type CategoryRemovalChoice =
  | { incomplete: 'delete' }
  | { incomplete: 'move'; targetId: CategoryId }
  | { incomplete: 'create'; name: string; color: string };

/** 실행 결과 — 되돌리기(R15)가 되감을 대상의 목록이다. */
export type CategoryRemovalResult = {
  categoryId: CategoryId;
  /** 카테고리 툼스톤과 ③ 으로 지운 투두가 공유하는 삭제 시각 (R14). */
  deletedAt: string;
  /** ③ 함께 삭제로 소프트 삭제된 투두. */
  deletedTodoIds: TodoId[];
  /** ①② 로 옮겨진 투두와 옮기기 **직전** 위치. */
  moved: Array<{ todoId: TodoId; prevCategoryId: CategoryId; prevOrder: number }>;
  /** ② 즉석 생성된 카테고리. */
  createdCategoryId?: CategoryId;
};

/** 날짜별 다음 `order` 를 배분하는 카운터 (R14-a). */
function orderAllocator(targetTodos: readonly Todo[]): (date: DateKey) => number {
  const next = new Map<DateKey, number>();
  return (date) => {
    const base = next.get(date) ?? nextTodoOrder(targetTodos.filter((t) => t.date === date));
    next.set(date, base + 1);
    return base;
  };
}

/** ② 즉석 생성. 이름 유일성·개수 제한은 같은 검증 함수를 쓰는 `createCategory` 가 본다 (R12). */
function createInstantCategory(
  choice: Extract<CategoryRemovalChoice, { incomplete: 'create' }>,
  existing: readonly Category[],
  deps: MetaDeps,
): Persistable<Category> {
  return createCategory({ name: choice.name, color: choice.color, existing }, deps);
}

/**
 * 삭제 실행 계획. 반환한 `writes` 를 `DatasetRepository.write(writes)` **한 번**으로 적용하면
 * 카테고리 삭제 + 미완료 처리 + 즉석 생성이 단일 트랜잭션이 된다 (R13).
 */
export function planCategoryRemoval(input: {
  category: Category;
  /** `todos.listByCategory(category.id)` 결과(툼스톤 제외). */
  todos: readonly Todo[];
  /** ①: 대상 카테고리의 투두 전량 / ②③: 빈 배열. */
  targetTodos: readonly Todo[];
  choice: CategoryRemovalChoice;
  deps: MetaDeps;
  /**
   * 삭제 시점의 카테고리 전량. ② 새 카테고리의 `order`(활성 최대 + 1, R5)와 이름 유일성 검증(R12)에만 쓴다.
   * ①③ 에서는 필요 없으므로 선택 인자다.
   */
  categories?: readonly Category[];
}): { writes: DatasetWrite[]; result: CategoryRemovalResult } {
  const { category, todos, targetTodos, choice, deps } = input;
  const at = deps.now();
  const tombstone = markDeleted(category, at);
  const incomplete = sortTodos(todos.filter((t) => !t.done));

  const writes: DatasetWrite[] = [];
  const deletedTodoIds: TodoId[] = [];
  const moved: CategoryRemovalResult['moved'] = [];
  let createdCategoryId: CategoryId | undefined;

  if (choice.incomplete === 'delete') {
    for (const todo of incomplete) {
      writes.push({ table: 'todos', entity: markDeleted(todo, at) });
      deletedTodoIds.push(todo.id);
    }
  } else {
    let targetId: CategoryId;
    if (choice.incomplete === 'create') {
      const created = createInstantCategory(choice, input.categories ?? [], deps);
      writes.push({ table: 'categories', entity: created });
      createdCategoryId = created.id;
      targetId = created.id;
    } else {
      if (choice.targetId === category.id || choice.targetId.length === 0) {
        throw new DomainError('CATEGORY_REMOVAL_TARGET_INVALID', choice.targetId);
      }
      targetId = choice.targetId;
    }
    const allocate = orderAllocator(targetTodos);
    for (const todo of incomplete) {
      const order = allocate(todo.date);
      writes.push({
        table: 'todos',
        entity: touch({ ...todo, categoryId: targetId, order }, at),
      });
      moved.push({ todoId: todo.id, prevCategoryId: todo.categoryId, prevOrder: todo.order });
    }
  }

  writes.push({ table: 'categories', entity: tombstone });
  return {
    writes,
    result: {
      categoryId: category.id,
      ...deletionStamp(tombstone),
      deletedTodoIds,
      moved,
      ...(createdCategoryId === undefined ? {} : { createdCategoryId }),
    },
  };
}

/**
 * 삭제 직전 값으로 **되감는다**. 삭제·이동이 이미 `rev` 를 +1 했으므로 그냥 `touch` 하면 되감기가
 * 툼스톤과 같은 `rev` 를 쓰게 된다(Phase 2 LWW 가 "변경됨"을 오판하는 자리 — ADR-0005 `rev` 행).
 * `appliedAt` 으로 그 +1 을 재현한 뒤 한 번 더 `touch` 해서 `rev` 계단을 정확히 하나 더 올린다.
 * 중간값의 `updatedAt` 은 바깥 `touch` 가 덮어쓰므로 결과에 남지 않는다.
 */
function rewind<T extends Meta>(before: T, appliedAt: string, at: string): Persistable<T> {
  return touch(touch(before, appliedAt), at);
}

/**
 * R15 되돌리기 계획. `category`·`todos` 는 **삭제 직전 값**이며 호출자(스토어)가 6초 창 동안 메모리에
 * 들고 있는 것이다 — 소프트 삭제된 뒤라 엔티티 조회로는 다시 읽히지 않고(ADR-0007 결정 4) 이 경로는
 * `readAll()` 을 쓰지 않는다. 삭제 직전 값을 그대로 `touch` 하므로 `deletedAt`·`categoryId`·`order` 가
 * 한 번에 원래대로 돌아간다. 역시 `DatasetRepository.write` 한 번으로 적용한다.
 */
export function planCategoryRemovalUndo(input: {
  result: CategoryRemovalResult;
  category: Category;
  todos: readonly Todo[];
  createdCategory?: Category;
  deps: { now: () => string };
}): { writes: DatasetWrite[] } {
  const { result, category, todos, createdCategory, deps } = input;
  const at = deps.now();
  const affected = new Set<TodoId>([
    ...result.deletedTodoIds,
    ...result.moved.map((m) => m.todoId),
  ]);
  const writes: DatasetWrite[] = [
    { table: 'categories', entity: rewind(category, result.deletedAt, at) },
  ];
  for (const todo of todos) {
    if (affected.has(todo.id)) {
      writes.push({ table: 'todos', entity: rewind(todo, result.deletedAt, at) });
    }
  }
  if (createdCategory !== undefined) {
    writes.push({ table: 'categories', entity: markDeleted(createdCategory, at) });
  }
  return { writes };
}
