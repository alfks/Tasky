import { describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import {
  MAX_DOTS,
  indexCategoryDots,
  summarizeDay,
  summarizeDays,
} from '@/domain/todo/day-summary';
import type { Todo } from '@/domain/todo/todo';

import { makeCategories, makeCategory } from '@/test/fixtures/category';
import { makeTodo } from '@/test/fixtures/todo';

/** 2026-09-17 은 목요일. 주 7일을 문자열로 고정해 둔다(도메인은 @/lib/date 를 import 하지 않는다). */
const WEEK: DateKey[] = [
  '2026-09-14',
  '2026-09-15',
  '2026-09-16',
  '2026-09-17',
  '2026-09-18',
  '2026-09-19',
  '2026-09-20',
];
const DAY: DateKey = '2026-09-17';

/** 그 날짜의 요약만 꺼낸다. 없으면 테스트를 실패시키는 편이 조용한 undefined 보다 낫다. */
function summaryOf(todos: Todo[], categories: Category[], day: DateKey = DAY) {
  const summary = summarizeDays(WEEK, todos, categories).get(day);
  if (summary === undefined) throw new Error(`요약 없음: ${day}`);
  return summary;
}

describe('R7. 점은 그날 투두가 있는 카테고리 색을 최대 3개, 4개 이상이면 3개 + "+n" 이다', () => {
  it('카테고리 3개면 점 3개에 넘침이 없다', () => {
    const categories = makeCategories(3);
    const todos = categories.map((c, i) => makeTodo({ seq: i + 1, date: DAY, categoryId: c.id }));
    const summary = summaryOf(todos, categories);
    expect(summary.dots.map((d) => d.color)).toEqual(categories.map((c) => c.color));
    expect(summary.overflowCount).toBe(0);
  });

  it('카테고리 5개면 점 3개 + 넘침 2 다', () => {
    const categories = makeCategories(5);
    const todos = categories.map((c, i) => makeTodo({ seq: i + 1, date: DAY, categoryId: c.id }));
    const summary = summaryOf(todos, categories);
    expect(summary.dots).toHaveLength(MAX_DOTS);
    expect(summary.overflowCount).toBe(2);
  });

  it('같은 카테고리 투두가 여러 건이어도 점은 1개다', () => {
    const category = makeCategory();
    const todos = [1, 2, 3].map((seq) => makeTodo({ seq, date: DAY, categoryId: category.id }));
    expect(summaryOf(todos, [category]).dots).toHaveLength(1);
  });

  it('점 순서는 활성 order → 종료 순이며 저장소가 준 배열 순서에 기대지 않는다', () => {
    const active = makeCategory({ seq: 1 });
    const closed = makeCategory({
      seq: 2,
      status: 'completed',
      closedAt: '2026-09-01T00:00:00.000Z',
    });
    const todos = [
      makeTodo({ seq: 1, date: DAY, categoryId: closed.id }),
      makeTodo({ seq: 2, date: DAY, categoryId: active.id }),
    ];
    // 종료된 것을 앞에 준 배열이어도 점 순서는 활성 먼저다.
    expect(summaryOf(todos, [closed, active]).dots.map((d) => d.color)).toEqual([
      active.color,
      closed.color,
    ]);
  });

  it('활성끼리는 order 가 작은 쪽이 앞선다', () => {
    const first = makeCategory({ seq: 1, order: 0 });
    const second = makeCategory({ seq: 2, order: 1 });
    const todos = [
      makeTodo({ seq: 1, date: DAY, categoryId: second.id }),
      makeTodo({ seq: 2, date: DAY, categoryId: first.id }),
    ];
    expect(summaryOf(todos, [second, first]).dots.map((d) => d.categoryId)).toEqual([
      first.id,
      second.id,
    ]);
  });

  it('삭제된 카테고리(저장소가 모르는 id)는 점도 넘침도 만들지 않고 개수에만 남는다', () => {
    const active = makeCategory({ seq: 1 });
    const todos = [
      makeTodo({ seq: 1, date: DAY, categoryId: 'gone' }),
      makeTodo({ seq: 2, date: DAY, categoryId: active.id, done: true }),
    ];
    const summary = summaryOf(todos, [active]);
    expect(summary.dots).toEqual([{ categoryId: active.id, color: active.color }]);
    expect(summary.overflowCount).toBe(0);
    expect(summary).toMatchObject({ total: 2, doneCount: 1 });
  });

  it('보이는 카테고리가 4개면 삭제된 카테고리가 섞여 있어도 넘침은 1 이다', () => {
    const categories = makeCategories(4);
    const todos = [
      ...categories.map((c, i) => makeTodo({ seq: i + 1, date: DAY, categoryId: c.id })),
      makeTodo({ seq: 5, date: DAY, categoryId: 'gone' }),
    ];
    const summary = summaryOf(todos, categories);
    expect(summary.dots).toHaveLength(MAX_DOTS);
    expect(summary.overflowCount).toBe(1);
  });

  it('투두가 없는 날은 점이 없다', () => {
    const summary = summaryOf([], [], '2026-09-16');
    expect(summary.dots).toEqual([]);
    expect(summary.total).toBe(0);
  });

  it('각 날짜가 자기 투두만 세고 투두가 없는 날도 빈 요약으로 남는다', () => {
    const category = makeCategory();
    const todos = [
      makeTodo({ seq: 1, date: '2026-09-15', categoryId: category.id }),
      makeTodo({ seq: 2, date: DAY, categoryId: category.id }),
      makeTodo({ seq: 3, date: DAY, categoryId: category.id }),
      // 주 밖의 날짜는 버린다.
      makeTodo({ seq: 4, date: '2026-10-01', categoryId: category.id }),
    ];
    const week = summarizeDays(WEEK, todos, [category]);
    expect([...week.keys()]).toEqual(WEEK);
    expect(week.get('2026-09-15')?.total).toBe(1);
    expect(week.get(DAY)?.total).toBe(2);
    expect(week.get('2026-09-14')?.total).toBe(0);
  });
});

describe('R8. ✓ 배지는 그날 투두가 1개 이상이고 전부 완료일 때만 붙는다', () => {
  it('전부 완료면 배지가 붙는다', () => {
    const category = makeCategory();
    const todos = [1, 2].map((seq) =>
      makeTodo({ seq, date: DAY, categoryId: category.id, done: true }),
    );
    const summary = summaryOf(todos, [category]);
    expect(summary.isAllDone).toBe(true);
    expect(summary.doneCount).toBe(2);
  });

  it('하나라도 남아 있으면 배지가 없다', () => {
    const category = makeCategory();
    const todos = [
      makeTodo({ seq: 1, date: DAY, categoryId: category.id, done: true }),
      makeTodo({ seq: 2, date: DAY, categoryId: category.id, done: false }),
    ];
    expect(summaryOf(todos, [category]).isAllDone).toBe(false);
  });

  it('투두가 0개인 날은 배지가 없다(빈 날을 완료로 치지 않는다)', () => {
    expect(summaryOf([], []).isAllDone).toBe(false);
  });
});

describe('§4. 조회표는 한 번 만들어 여러 날짜에 나눠 쓴다', () => {
  it('summarizeDay 는 미리 만든 조회표를 그대로 받는다', () => {
    const category = makeCategory();
    const index = indexCategoryDots([category]);
    const summary = summarizeDay([makeTodo({ date: DAY, categoryId: category.id })], index);
    expect(summary.dots).toEqual([{ categoryId: category.id, color: category.color }]);
  });

  it('조회표가 비어 있으면 어떤 투두도 점을 얻지 못한다', () => {
    const summary = summarizeDay([makeTodo({ date: DAY })], indexCategoryDots([]));
    expect(summary.dots).toEqual([]);
    expect(summary.total).toBe(1);
  });
});
