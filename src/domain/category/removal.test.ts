import { describe, expect, it } from 'vitest';

import { planCategoryRemoval, planCategoryRemovalUndo } from '@/domain/category/removal';
import type { DatasetWrite } from '@/domain/dataset';
import type { DateKey } from '@/domain/date/date-key';
import { PALETTE } from '@/domain/theme/palette';
import type { Todo } from '@/domain/todo/todo';

import { makeCategory } from '@/test/fixtures/category';
import { countingDeps, FIXTURE_INSTANT, fixedDeps } from '@/test/fixtures/deps';
import { makeTodo } from '@/test/fixtures/todo';

const AT = '2026-02-01T10:00:00.000Z';
const UNDO_AT = '2026-02-01T10:00:04.000Z';
const D1 = '2026-01-15' as DateKey;
const D2 = '2026-01-16' as DateKey;
const CORAL = PALETTE[0].light;

const category = makeCategory({ seq: 1, name: '공부', order: 0 });
const target = makeCategory({ seq: 2, name: '운동', order: 1 });

/** 미완료 3(두 날짜) + 완료 2. */
const todos: Todo[] = [
  makeTodo({ seq: 1, categoryId: category.id, date: D1, order: 1 }),
  makeTodo({ seq: 2, categoryId: category.id, date: D1, order: 0 }),
  makeTodo({ seq: 3, categoryId: category.id, date: D2, order: 5 }),
  makeTodo({
    seq: 4,
    categoryId: category.id,
    date: D1,
    order: 2,
    done: true,
    doneAt: FIXTURE_INSTANT,
  }),
  makeTodo({
    seq: 5,
    categoryId: category.id,
    date: D2,
    order: 6,
    done: true,
    doneAt: FIXTURE_INSTANT,
  }),
];

const todoWrites = (writes: readonly DatasetWrite[]) =>
  writes.filter((w) => w.table === 'todos').map((w) => w.entity);
const categoryWrites = (writes: readonly DatasetWrite[]) =>
  writes.filter((w) => w.table === 'categories').map((w) => w.entity);

describe('planCategoryRemoval — 공통 계약 (R13·R14)', () => {
  it('시각을 한 번만 읽어 카테고리·투두가 같은 deletedAt 을 쓴다', () => {
    const deps = countingDeps(AT);
    const { writes, result } = planCategoryRemoval({
      category,
      todos,
      targetTodos: [],
      choice: { incomplete: 'delete' },
      deps,
    });
    expect(deps.nowCalls()).toBe(1);
    expect(result.deletedAt).toBe(AT);
    expect(categoryWrites(writes)[0].deletedAt).toBe(AT);
    expect(todoWrites(writes).every((t) => t.deletedAt === AT)).toBe(true);
  });

  it('완료 투두는 writes 에 한 건도 들어가지 않는다', () => {
    for (const choice of [
      { incomplete: 'delete' } as const,
      { incomplete: 'move', targetId: target.id } as const,
    ]) {
      const { writes } = planCategoryRemoval({
        category,
        todos,
        targetTodos: [],
        choice,
        deps: fixedDeps({ now: AT }),
      });
      const writtenIds = todoWrites(writes).map((t) => t.id);
      expect(writtenIds).not.toContain(todos[3].id);
      expect(writtenIds).not.toContain(todos[4].id);
      expect(writtenIds).toHaveLength(3);
    }
  });
});

describe('① 다른 카테고리로 옮기기 (R14-a)', () => {
  const targetTodos = [
    makeTodo({ seq: 11, categoryId: target.id, date: D1, order: 0 }),
    makeTodo({ seq: 12, categoryId: target.id, date: D1, order: 4 }),
  ];

  it('날짜별로 대상 그룹 끝부터 원래 순서를 지킨 연속 번호를 받는다', () => {
    const { writes, result } = planCategoryRemoval({
      category,
      todos,
      targetTodos,
      choice: { incomplete: 'move', targetId: target.id },
      deps: fixedDeps({ now: AT }),
    });
    const moved = todoWrites(writes);
    expect(moved.map((t) => [t.id, t.date, t.order])).toEqual([
      [todos[1].id, D1, 5], // D1 base = 4 + 1, 원래 order 0 이 먼저
      [todos[0].id, D1, 6],
      [todos[2].id, D2, 0], // D2 는 대상 그룹이 비어 있어 0 부터
    ]);
    expect(moved.every((t) => t.categoryId === target.id)).toBe(true);
    expect(result.moved).toEqual([
      { todoId: todos[1].id, prevCategoryId: category.id, prevOrder: 0 },
      { todoId: todos[0].id, prevCategoryId: category.id, prevOrder: 1 },
      { todoId: todos[2].id, prevCategoryId: category.id, prevOrder: 5 },
    ]);
    expect(result.deletedTodoIds).toEqual([]);
  });

  it('order·createdAt 이 같아도 id 로 순서가 확정된다(두 구현이 같은 결과)', () => {
    const tied = [
      makeTodo({ seq: 2, categoryId: category.id, date: D1, order: 0 }),
      makeTodo({ seq: 1, categoryId: category.id, date: D1, order: 0 }),
    ];
    const { writes } = planCategoryRemoval({
      category,
      todos: tied,
      targetTodos: [],
      choice: { incomplete: 'move', targetId: target.id },
      deps: fixedDeps({ now: AT }),
    });
    const moved = todoWrites(writes);
    expect(moved[0].id < moved[1].id).toBe(true);
    expect(moved.map((t) => t.order)).toEqual([0, 1]);
  });

  it('자기 자신을 대상으로 고르면 거부한다', () => {
    expect(() =>
      planCategoryRemoval({
        category,
        todos,
        targetTodos: [],
        choice: { incomplete: 'move', targetId: category.id },
        deps: fixedDeps({ now: AT }),
      }),
    ).toThrow(expect.objectContaining({ code: 'CATEGORY_REMOVAL_TARGET_INVALID' }));
  });
});

describe('② 새 카테고리를 만들어 옮기기 (R12)', () => {
  it('새 카테고리를 만들고 order 는 활성 최대 + 1, 투두는 그 카테고리로 간다', () => {
    const { writes, result } = planCategoryRemoval({
      category,
      todos,
      targetTodos: [],
      choice: { incomplete: 'create', name: '새 그룹', color: CORAL },
      deps: fixedDeps({ now: AT }),
      categories: [category, target],
    });
    const created = categoryWrites(writes)[0];
    expect(created).toMatchObject({ name: '새 그룹', color: CORAL, order: 2, status: 'active' });
    expect(result.createdCategoryId).toBe(created.id);
    expect(todoWrites(writes).every((t) => t.categoryId === created.id)).toBe(true);
    expect(todoWrites(writes).map((t) => t.order)).toEqual([0, 1, 0]);
  });

  it('즉석 생성도 같은 검증 함수를 쓴다', () => {
    expect(() =>
      planCategoryRemoval({
        category,
        todos,
        targetTodos: [],
        choice: { incomplete: 'create', name: '  ', color: CORAL },
        deps: fixedDeps({ now: AT }),
      }),
    ).toThrow(expect.objectContaining({ code: 'CATEGORY_NAME_REQUIRED' }));
  });
});

describe('③ 함께 삭제 (R14)', () => {
  it('미완료만 카테고리와 같은 deletedAt 으로 소프트 삭제된다', () => {
    const { writes, result } = planCategoryRemoval({
      category,
      todos,
      targetTodos: [],
      choice: { incomplete: 'delete' },
      deps: fixedDeps({ now: AT }),
    });
    expect(result.deletedTodoIds).toEqual([todos[1].id, todos[0].id, todos[2].id]);
    expect(result.moved).toEqual([]);
    expect(todoWrites(writes).every((t) => t.deletedAt === AT && t.rev === 2)).toBe(true);
  });
});

describe('planCategoryRemovalUndo (R15)', () => {
  it('카테고리와 영향받은 투두만 삭제 직전 값으로 되감고, rev 는 앞으로만 간다', () => {
    const { result } = planCategoryRemoval({
      category,
      todos,
      targetTodos: [],
      choice: { incomplete: 'move', targetId: target.id },
      deps: fixedDeps({ now: AT }),
    });
    const { writes } = planCategoryRemovalUndo({
      result,
      category,
      todos,
      deps: { now: () => UNDO_AT },
    });
    const restored = categoryWrites(writes)[0];
    expect(restored.deletedAt).toBeUndefined();
    expect(restored.rev).toBe(category.rev + 2); // 삭제(+1) 위에 되감기(+1)
    expect(restored.updatedAt).toBe(UNDO_AT);

    const restoredTodos = todoWrites(writes);
    expect(restoredTodos).toHaveLength(3);
    expect(restoredTodos.every((t) => t.categoryId === category.id)).toBe(true);
    expect(restoredTodos.map((t) => t.order)).toEqual([1, 0, 5]);
    // 완료 투두는 되감기에도 들어가지 않는다.
    expect(restoredTodos.map((t) => t.id)).not.toContain(todos[3].id);
  });

  it('③ 으로 지운 투두는 deletedAt 이 사라진다', () => {
    const { result } = planCategoryRemoval({
      category,
      todos,
      targetTodos: [],
      choice: { incomplete: 'delete' },
      deps: fixedDeps({ now: AT }),
    });
    const { writes } = planCategoryRemovalUndo({
      result,
      category,
      todos,
      deps: { now: () => UNDO_AT },
    });
    expect(todoWrites(writes).every((t) => t.deletedAt === undefined)).toBe(true);
  });

  it('② 로 만든 카테고리는 되돌릴 때 소프트 삭제된다', () => {
    const { writes: doWrites, result } = planCategoryRemoval({
      category,
      todos,
      targetTodos: [],
      choice: { incomplete: 'create', name: '새 그룹', color: CORAL },
      deps: fixedDeps({ now: AT }),
      categories: [category],
    });
    const created = categoryWrites(doWrites)[0];
    const { writes } = planCategoryRemovalUndo({
      result,
      category,
      todos,
      createdCategory: created,
      deps: { now: () => UNDO_AT },
    });
    const undoneCreated = categoryWrites(writes).find((c) => c.id === created.id);
    expect(undoneCreated?.deletedAt).toBe(UNDO_AT);
  });
});
