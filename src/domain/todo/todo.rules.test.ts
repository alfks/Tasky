import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import { DomainError } from '@/domain/errors';
import {
  addTodoFocusSeconds,
  changeTodoCategory,
  createTodo,
  deleteTodo,
  editTodo,
  moveTodoToDate,
  normalizeTodoMemo,
  normalizeTodoTitle,
  toggleTodoDone,
  validateTodoMemo,
  validateTodoTitle,
} from '@/domain/todo/todo.rules';

import { FIXTURE_DATE, FIXTURE_INSTANT, fixedDeps } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID, makeTodo, makeTodos } from '@/test/fixtures/todo';

const LATER = '2026-01-15T09:30:00.000Z';
const deps = fixedDeps();
const laterDeps = fixedDeps({ now: LATER });

describe('제목 정규화·검증 (R1)', () => {
  it('줄바꿈은 공백이 되고 앞뒤 공백은 사라진다', () => {
    expect(normalizeTodoTitle('  장보기\n우유  ')).toBe('장보기 우유');
    expect(normalizeTodoTitle('a\r\nb')).toBe('a b');
  });

  it('비어 있으면 TODO_TITLE_REQUIRED', () => {
    expect(() => validateTodoTitle('   \n ')).toThrow(
      expect.objectContaining({ code: 'TODO_TITLE_REQUIRED' }),
    );
  });

  it('100자는 통과하고 101자는 TODO_TITLE_TOO_LONG', () => {
    expect(validateTodoTitle('가'.repeat(100))).toHaveLength(100);
    expect(() => validateTodoTitle('가'.repeat(101))).toThrow(
      expect.objectContaining({ code: 'TODO_TITLE_TOO_LONG' }),
    );
  });

  it('이모지는 코드 포인트 하나로 센다', () => {
    expect(() => validateTodoTitle('🙂'.repeat(100))).not.toThrow();
  });
});

describe('메모 정규화·검증 (R2)', () => {
  it('줄바꿈은 유지되고 빈 메모는 undefined 다', () => {
    expect(normalizeTodoMemo('우유\n달걀')).toBe('우유\n달걀');
    expect(normalizeTodoMemo('   ')).toBeUndefined();
    expect(normalizeTodoMemo(undefined)).toBeUndefined();
  });

  it('500자는 통과하고 501자는 TODO_MEMO_TOO_LONG', () => {
    expect(validateTodoMemo('가'.repeat(500))).toHaveLength(500);
    expect(() => validateTodoMemo('가'.repeat(501))).toThrow(
      expect.objectContaining({ code: 'TODO_MEMO_TOO_LONG' }),
    );
  });
});

describe('createTodo (R5)', () => {
  it('order 는 같은 그룹의 최대 + 1 이고 done 은 false 로 시작한다', () => {
    const siblings = makeTodos(3, (i) => ({ order: i * 2 }));
    const todo = createTodo(
      { categoryId: FIXTURE_CATEGORY_ID, date: FIXTURE_DATE, title: ' 장보기 ', siblings },
      deps,
    );
    expect(todo).toMatchObject({ title: '장보기', done: false, order: 5, rev: 1 });
    expect(todo.createdAt).toBe(FIXTURE_INSTANT);
    expect(todo.updatedAt).toBe(FIXTURE_INSTANT);
  });

  it('빈 그룹이면 order 0 이고, 메모가 비면 필드 자체가 없다', () => {
    const todo = createTodo(
      { categoryId: FIXTURE_CATEGORY_ID, date: FIXTURE_DATE, title: '첫 할 일', siblings: [] },
      deps,
    );
    expect(todo.order).toBe(0);
    expect('memo' in todo).toBe(false);
  });

  it('메모를 주면 정규화해서 넣는다', () => {
    const todo = createTodo(
      {
        categoryId: FIXTURE_CATEGORY_ID,
        date: FIXTURE_DATE,
        title: '장보기',
        memo: '  우유\n달걀  ',
        siblings: [],
      },
      deps,
    );
    expect(todo.memo).toBe('우유\n달걀');
  });

  it('routineId 를 주면 그대로 찍히고, 안 주면 필드 자체가 없다 (routine.md §4)', () => {
    const withRoutine = createTodo(
      {
        categoryId: FIXTURE_CATEGORY_ID,
        date: FIXTURE_DATE,
        title: '운동',
        siblings: [],
        routineId: 'r1',
      },
      deps,
    );
    expect(withRoutine.routineId).toBe('r1');

    const withoutRoutine = createTodo(
      { categoryId: FIXTURE_CATEGORY_ID, date: FIXTURE_DATE, title: '운동', siblings: [] },
      deps,
    );
    expect('routineId' in withoutRoutine).toBe(false);
  });
});

describe('toggleTodoDone (R6)', () => {
  it('완료하면 doneAt 을 기록하고 order 는 그대로다', () => {
    const todo = makeTodo({ order: 3 });
    const done = toggleTodoDone(todo, true, laterDeps);
    expect(done).toMatchObject({ done: true, doneAt: LATER, order: 3, rev: 2 });
    expect(done.updatedAt).toBe(LATER);
  });

  it('해제하면 doneAt 필드가 사라지고 order 는 보존된다', () => {
    const done = makeTodo({ done: true, doneAt: FIXTURE_INSTANT, order: 3 });
    const undone = toggleTodoDone(done, false, laterDeps);
    expect(undone.done).toBe(false);
    expect('doneAt' in undone).toBe(false);
    expect(undone.order).toBe(3);
  });
});

describe('editTodo (R14)', () => {
  it('제목만 바꾸면 메모는 그대로다', () => {
    const todo = makeTodo({ memo: '우유' });
    expect(editTodo(todo, { title: ' 새 제목 ' }, laterDeps)).toMatchObject({
      title: '새 제목',
      memo: '우유',
    });
  });

  it('memo: null 은 메모를 지운다', () => {
    const edited = editTodo(makeTodo({ memo: '우유' }), { memo: null }, laterDeps);
    expect('memo' in edited).toBe(false);
  });

  it('검증은 생성과 같은 함수를 쓴다', () => {
    expect(() => editTodo(makeTodo(), { title: '  ' }, laterDeps)).toThrow(DomainError);
  });
});

describe('그룹 이동 (R10·R12)', () => {
  it('날짜 이동은 카테고리·done 을 유지하고 대상 날짜 그룹 끝으로 간다', () => {
    const todo = makeTodo({ done: true, doneAt: FIXTURE_INSTANT, order: 0 });
    const target = makeTodos(2, (i) => ({ date: '2026-01-16' as DateKey, order: i + 4 }));
    const moved = moveTodoToDate(todo, '2026-01-16' as DateKey, target, laterDeps);
    expect(moved).toMatchObject({
      date: '2026-01-16',
      categoryId: FIXTURE_CATEGORY_ID,
      done: true,
      order: 6,
    });
  });

  it('카테고리 변경은 날짜를 유지하고 대상 그룹 끝으로 간다', () => {
    const moved = changeTodoCategory(makeTodo(), 'other-cat', [makeTodo({ order: 9 })], laterDeps);
    expect(moved).toMatchObject({ categoryId: 'other-cat', date: FIXTURE_DATE, order: 10 });
  });
});

describe('삭제·집중 시간', () => {
  it('deleteTodo 는 소프트 삭제다 (R13)', () => {
    const removed = deleteTodo(makeTodo(), laterDeps);
    expect(removed.deletedAt).toBe(LATER);
    expect(removed.rev).toBe(2);
  });

  it('addTodoFocusSeconds 는 누적하고 음수는 무시한다 (timer R8)', () => {
    const once = addTodoFocusSeconds(makeTodo(), 1500, laterDeps);
    expect(once.focusSeconds).toBe(1500);
    expect(addTodoFocusSeconds(once, 300, laterDeps).focusSeconds).toBe(1800);
    expect(addTodoFocusSeconds(once, -10, laterDeps).focusSeconds).toBe(1500);
  });
});
