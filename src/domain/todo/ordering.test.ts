import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import {
  compareTodos,
  groupTodosForDisplay,
  moveTodoBy,
  nextTodoOrder,
  reorderTodos,
  sortTodos,
  todosInGroup,
} from '@/domain/todo/ordering';

import { fixedDeps } from '@/test/fixtures/deps';
import { makeTodo, makeTodos } from '@/test/fixtures/todo';

const deps = fixedDeps({ now: '2026-01-15T09:00:00.000Z' });
const ids = (todos: readonly { id: string }[]): string[] => todos.map((t) => t.id);

describe('compareTodos — 3단계 정렬로 동률을 남기지 않는다', () => {
  it('order 가 다르면 order 순', () => {
    expect(compareTodos(makeTodo({ order: 1 }), makeTodo({ seq: 2, order: 2 }))).toBeLessThan(0);
  });

  it('order 가 같으면 createdAt 순', () => {
    const older = makeTodo({ seq: 1, order: 0, createdAt: '2026-01-01T00:00:00.000Z' });
    const newer = makeTodo({ seq: 2, order: 0, createdAt: '2026-01-02T00:00:00.000Z' });
    expect(compareTodos(older, newer)).toBeLessThan(0);
  });

  it('order·createdAt 이 같으면 id 순 — 여기서 동률이 끝난다', () => {
    const a = makeTodo({ seq: 1, order: 0 });
    const b = makeTodo({ seq: 2, order: 0 });
    expect(compareTodos(a, b)).toBeLessThan(0);
    expect(compareTodos(a, a)).toBe(0);
  });

  it('sortTodos 는 원본을 건드리지 않는다', () => {
    const todos = makeTodos(3, (i) => ({ order: 2 - i }));
    const before = ids(todos);
    sortTodos(todos);
    expect(ids(todos)).toEqual(before);
  });
});

describe('nextTodoOrder / todosInGroup', () => {
  it('빈 그룹이면 0, 아니면 최대 + 1', () => {
    expect(nextTodoOrder([])).toBe(0);
    expect(nextTodoOrder(makeTodos(3, (i) => ({ order: i * 3 })))).toBe(7);
  });

  it('같은 날짜·카테고리만 고른다', () => {
    const todos = [
      makeTodo({ seq: 1 }),
      makeTodo({ seq: 2, date: '2026-01-16' as DateKey }),
      makeTodo({ seq: 3, categoryId: 'other' }),
    ];
    expect(todosInGroup(todos, todos[0].date, todos[0].categoryId)).toHaveLength(1);
  });
});

describe('groupTodosForDisplay (R7)', () => {
  it('미완료는 order 순, 완료는 doneAt 내림차순(방금 완료한 것이 위)', () => {
    const todos = [
      makeTodo({ seq: 1, order: 1 }),
      makeTodo({ seq: 2, order: 0 }),
      makeTodo({ seq: 3, order: 2, done: true, doneAt: '2026-01-15T01:00:00.000Z' }),
      makeTodo({ seq: 4, order: 3, done: true, doneAt: '2026-01-15T05:00:00.000Z' }),
    ];
    const { incomplete, completed } = groupTodosForDisplay(todos);
    expect(ids(incomplete)).toEqual([todos[1].id, todos[0].id]);
    expect(ids(completed)).toEqual([todos[3].id, todos[2].id]);
  });

  it('완료만·미완료만 있어도 빈 배열로 나뉜다', () => {
    expect(groupTodosForDisplay(makeTodos(2)).completed).toEqual([]);
    expect(groupTodosForDisplay(makeTodos(2, () => ({ done: true }))).incomplete).toEqual([]);
  });
});

describe('reorderTodos (R11)', () => {
  it('완료 항목을 포함한 전체를 0..n-1 로 재매김하고 바뀐 것만 돌려준다', () => {
    const todos = makeTodos(4, (i) => ({ order: i, done: i === 1 }));
    const changed = reorderTodos(todos, todos[3].id, 0, deps);
    const byId = new Map(changed.map((t) => [t.id, t.order]));
    expect(byId.get(todos[3].id)).toBe(0);
    expect(byId.get(todos[0].id)).toBe(1);
    expect(byId.get(todos[1].id)).toBe(2);
    expect(byId.get(todos[2].id)).toBe(3);
    expect(changed.every((t) => t.rev === 2)).toBe(true);
  });

  it('제자리로 옮기면 아무것도 바뀌지 않는다', () => {
    const todos = makeTodos(3, (i) => ({ order: i }));
    expect(reorderTodos(todos, todos[1].id, 1, deps)).toEqual([]);
  });

  it('완료 항목은 옮길 수 없고, 그룹 밖 id 도 거부한다', () => {
    const todos = makeTodos(2, (i) => ({ order: i, done: i === 0 }));
    expect(() => reorderTodos(todos, todos[0].id, 1, deps)).toThrow(
      expect.objectContaining({ code: 'TODO_REORDER_DONE' }),
    );
    expect(() => reorderTodos(todos, 'nope', 0, deps)).toThrow(
      expect.objectContaining({ code: 'TODO_NOT_IN_GROUP' }),
    );
  });
});

describe('moveTodoBy (R11 Alt+↑/↓)', () => {
  it('완료 항목을 건너뛰고 미완료 이웃과 자리를 바꾼다', () => {
    const todos = makeTodos(3, (i) => ({ order: i, done: i === 1 }));
    const changed = moveTodoBy(todos, todos[2].id, -1, deps);
    const byId = new Map(changed.map((t) => [t.id, t.order]));
    // 미완료 블록이 [t0, t2] → [t2, t0] 로 한 칸만 움직이고, 완료 항목 t1 은 상대 위치를 지킨 채 밀린다.
    expect(byId.get(todos[2].id)).toBe(0);
    expect(byId.get(todos[0].id)).toBe(1);
    expect(byId.get(todos[1].id)).toBe(2);
  });

  it('더 갈 이웃이 없으면 빈 배열', () => {
    const todos = makeTodos(3, (i) => ({ order: i }));
    expect(moveTodoBy(todos, todos[0].id, -1, deps)).toEqual([]);
    expect(moveTodoBy(todos, todos[2].id, 1, deps)).toEqual([]);
  });

  it('아래로 한 칸 이동', () => {
    const todos = makeTodos(3, (i) => ({ order: i }));
    const changed = moveTodoBy(todos, todos[0].id, 1, deps);
    expect(new Map(changed.map((t) => [t.id, t.order])).get(todos[0].id)).toBe(1);
  });
});
