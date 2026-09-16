// 파생 선택자 테스트 (todo.md R7·R15). 상태를 손으로 만들어 **삽입 순서와 정답 순서를 일부러 어긋나게**
// 둔다 — 그래야 "정렬을 빼먹어도 통과하는" 테스트가 되지 않는다(`Object.values` 는 삽입 순서다).
import { describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { Todo } from '@/domain/todo/todo';

import {
  selectCompletion,
  selectGroup,
  selectGroups,
  selectTodoById,
  selectTodos,
} from '@/features/todo/store/todo-selectors';
import type { TodoSnapshot } from '@/features/todo/store/todo-state';
import { makeCategory } from '@/test/fixtures/category';
import { FIXTURE_CATEGORY_ID, makeTodo } from '@/test/fixtures/todo';

/** 인자 순서가 그대로 삽입 순서가 된다 — 정렬이 없으면 이 순서가 그대로 결과로 나온다. */
function snapshot(...todos: readonly Todo[]): TodoSnapshot {
  return { byId: Object.fromEntries(todos.map((todo) => [todo.id, todo])) };
}

const titles = (todos: readonly Todo[]): string[] => todos.map((todo) => todo.title);

/** 종료 카테고리 픽스처의 `closedAt`. */
const CLOSED_AT = '2026-01-15T12:00:00.000Z';

describe('selectTodos (R7 표준 정렬)', () => {
  it('`order` 오름차순으로 돌려준다 — 삽입 순서가 역순이어도', () => {
    const state = snapshot(
      makeTodo({ seq: 3, order: 2, title: 'C' }),
      makeTodo({ seq: 1, order: 0, title: 'A' }),
      makeTodo({ seq: 2, order: 1, title: 'B' }),
    );

    expect(titles(selectTodos(state))).toEqual(['A', 'B', 'C']);
  });

  it('`order` 동률은 `createdAt` 오름차순으로 끊는다', () => {
    const state = snapshot(
      makeTodo({ seq: 1, order: 0, createdAt: '2026-01-15T09:00:00.000Z', title: '나중' }),
      makeTodo({ seq: 2, order: 0, createdAt: '2026-01-15T08:00:00.000Z', title: '먼저' }),
    );

    expect(titles(selectTodos(state))).toEqual(['먼저', '나중']);
  });

  it('`order`·`createdAt` 이 모두 같으면 `id` 오름차순으로 끊는다 (동률이 남지 않는다)', () => {
    // 삽입 순서는 큰 id 가 먼저다 — 타이브레이크가 없으면 그대로 나온다.
    const state = snapshot(
      makeTodo({ seq: 9, order: 0, title: '큰 id' }),
      makeTodo({ seq: 2, order: 0, title: '작은 id' }),
    );

    expect(titles(selectTodos(state))).toEqual(['작은 id', '큰 id']);
  });
});

describe('selectGroup (R7 그룹 배치)', () => {
  it('미완료 블록은 `order` 오름차순이다 — 삽입 순서가 어긋나 있어도', () => {
    const state = snapshot(
      makeTodo({ seq: 3, order: 2, title: 'C' }),
      makeTodo({ seq: 1, order: 0, title: 'A' }),
      makeTodo({ seq: 2, order: 1, title: 'B' }),
    );

    expect(titles(selectGroup(state, FIXTURE_CATEGORY_ID).incomplete)).toEqual(['A', 'B', 'C']);
  });

  it('`sequence` 는 완료를 포함한 그룹 전체 수열이다 (R11 `targetIndex` 좌표계)', () => {
    const state = snapshot(
      makeTodo({ seq: 3, order: 2, title: 'C' }),
      makeTodo({ seq: 2, order: 1, done: true, doneAt: '2026-01-15T10:00:00.000Z', title: 'B' }),
      makeTodo({ seq: 1, order: 0, title: 'A' }),
    );

    const group = selectGroup(state, FIXTURE_CATEGORY_ID);

    // 가시 인덱스(미완료 블록)와 다르다 — 드롭 지점은 이 수열로 계산해야 한다.
    expect(titles(group.sequence)).toEqual(['A', 'B', 'C']);
    expect(titles(group.incomplete)).toEqual(['A', 'C']);
  });

  it('완료 항목은 미완료 블록이 아니라 완료 블록에 들어간다', () => {
    const state = snapshot(
      makeTodo({ seq: 1, order: 0, done: true, doneAt: '2026-01-15T10:00:00.000Z', title: '끝' }),
      makeTodo({ seq: 2, order: 1, title: '남음' }),
    );

    const group = selectGroup(state, FIXTURE_CATEGORY_ID);

    expect(titles(group.incomplete)).toEqual(['남음']);
    expect(titles(group.completed)).toEqual(['끝']);
  });

  it('완료 블록은 `doneAt` 내림차순 — 방금 완료한 것이 맨 위다', () => {
    const state = snapshot(
      makeTodo({ seq: 1, order: 0, done: true, doneAt: '2026-01-15T10:00:00.000Z', title: '먼저' }),
      makeTodo({ seq: 2, order: 1, done: true, doneAt: '2026-01-15T11:00:00.000Z', title: '방금' }),
    );

    expect(titles(selectGroup(state, FIXTURE_CATEGORY_ID).completed)).toEqual(['방금', '먼저']);
  });

  it('`doneAt` 동률인 완료 항목도 순서가 정해진다 (`order` → `createdAt` → `id`)', () => {
    const at = '2026-01-15T10:00:00.000Z';
    const state = snapshot(
      makeTodo({ seq: 1, order: 5, done: true, doneAt: at, title: '뒤' }),
      makeTodo({ seq: 2, order: 1, done: true, doneAt: at, title: '앞' }),
    );

    expect(titles(selectGroup(state, FIXTURE_CATEGORY_ID).completed)).toEqual(['앞', '뒤']);
  });

  it('다른 카테고리의 투두는 섞이지 않고, 없는 카테고리는 빈 그룹이다', () => {
    const other = makeCategory({ seq: 2 }).id;
    const state = snapshot(
      makeTodo({ seq: 1, order: 0, title: '내 것' }),
      makeTodo({ seq: 2, order: 0, categoryId: other, title: '남의 것' }),
    );

    expect(titles(selectGroup(state, FIXTURE_CATEGORY_ID).incomplete)).toEqual(['내 것']);
    expect(selectGroup(state, makeCategory({ seq: 9 }).id)).toEqual({
      categoryId: makeCategory({ seq: 9 }).id,
      sequence: [],
      incomplete: [],
      completed: [],
      counts: { done: 0, total: 0 },
    });
  });

  it('`counts` 는 그 그룹의 완료/전체다', () => {
    const state = snapshot(
      makeTodo({ seq: 1, order: 0, done: true, doneAt: '2026-01-15T10:00:00.000Z' }),
      makeTodo({ seq: 2, order: 1 }),
      makeTodo({ seq: 3, order: 2 }),
    );

    expect(selectGroup(state, FIXTURE_CATEGORY_ID).counts).toEqual({ done: 1, total: 3 });
  });
});

describe('selectGroups (R15 그룹 순서)', () => {
  const idsOf = (groups: readonly { categoryId: string }[]): string[] =>
    groups.map((group) => group.categoryId);

  it('활성 카테고리를 `order` 오름차순으로 — 인자 순서가 뒤집혀 있어도', () => {
    const first = makeCategory({ seq: 1, order: 0 });
    const second = makeCategory({ seq: 2, order: 1 });

    expect(idsOf(selectGroups(snapshot(), [second, first]))).toEqual([first.id, second.id]);
  });

  it('활성 `order` 동률은 `createdAt` → `id` 로 끊는다 (동률이 남지 않는다)', () => {
    const late = makeCategory({ seq: 1, order: 0, createdAt: '2026-01-15T09:00:00.000Z' });
    const early = makeCategory({ seq: 2, order: 0, createdAt: '2026-01-15T08:00:00.000Z' });

    expect(idsOf(selectGroups(snapshot(), [late, early]))).toEqual([early.id, late.id]);
  });

  it('투두가 없어도 활성 카테고리 그룹은 남는다 (빈 그룹의 입력 행이 시작점이다)', () => {
    const groups = selectGroups(snapshot(), [makeCategory({ seq: 1 })]);

    expect(groups).toHaveLength(1);
    expect(groups[0].incomplete).toEqual([]);
  });

  it('종료 카테고리는 그날 투두가 있을 때만 나오고 활성 뒤에 온다', () => {
    const active = makeCategory({ seq: 1, order: 0 });
    const closedEmpty = makeCategory({ seq: 2, status: 'completed', closedAt: CLOSED_AT });
    const closedUsed = makeCategory({ seq: 3, status: 'paused', closedAt: CLOSED_AT });
    const state = snapshot(makeTodo({ seq: 1, categoryId: closedUsed.id }));

    expect(idsOf(selectGroups(state, [active, closedEmpty, closedUsed]))).toEqual([
      active.id,
      closedUsed.id,
    ]);
  });

  it('카테고리 목록에 없는 투두(삭제된 카테고리의 잔여분)는 맨 뒤에 `id` 오름차순으로 붙는다', () => {
    const active = makeCategory({ seq: 1, order: 0 });
    const goneLate = makeCategory({ seq: 9 }).id;
    const goneEarly = makeCategory({ seq: 5 }).id;
    const state = snapshot(
      makeTodo({ seq: 1, categoryId: goneLate }),
      makeTodo({ seq: 2, categoryId: goneEarly }),
      makeTodo({ seq: 3, categoryId: active.id }),
    );

    expect(idsOf(selectGroups(state, [active]))).toEqual([active.id, goneEarly, goneLate]);
  });

  it('삭제된(툼스톤) 카테고리는 투두가 없으면 그룹을 만들지 않는다', () => {
    const deleted: Category = {
      ...makeCategory({ seq: 2 }),
      deletedAt: '2026-01-15T12:00:00.000Z',
    };

    expect(selectGroups(snapshot(), [makeCategory({ seq: 1 }), deleted])).toHaveLength(1);
  });
});

describe('selectTodoById · selectCompletion', () => {
  it('id 로 한 건을 집고, 없으면 undefined 다', () => {
    const todo = makeTodo({ seq: 1 });
    const state = snapshot(todo);

    expect(selectTodoById(state, todo.id)?.title).toBe(todo.title);
    expect(selectTodoById(state, makeTodo({ seq: 7 }).id)).toBeUndefined();
  });

  it('그날 전체의 완료/전체를 카테고리와 무관하게 센다', () => {
    const other = makeCategory({ seq: 2 }).id;
    const state = snapshot(
      makeTodo({ seq: 1, done: true, doneAt: '2026-01-15T10:00:00.000Z' }),
      makeTodo({ seq: 2, categoryId: other }),
    );

    expect(selectCompletion(state)).toEqual({ done: 1, total: 2 });
  });
});
