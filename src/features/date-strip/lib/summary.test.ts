import { describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';

import { DELETED_CATEGORY_COLOR, MAX_DOTS, summarizeWeek } from '@/features/date-strip/lib/summary';
import { weekDays } from '@/features/date-strip/lib/week';
import { makeCategories, makeCategory } from '@/test/fixtures/category';
import { makeTodo } from '@/test/fixtures/todo';

const WEEK = weekDays('2026-09-17');
const DAY: DateKey = '2026-09-17';

/** 그 날짜의 요약만 꺼낸다. 없으면 테스트를 실패시키는 편이 조용한 undefined 보다 낫다. */
function summaryOf(
  days: DateKey[],
  todos: Parameters<typeof summarizeWeek>[1],
  categories: Category[],
  day: DateKey,
) {
  const summary = summarizeWeek(days, todos, categories).get(day);
  if (summary === undefined) throw new Error(`요약 없음: ${day}`);
  return summary;
}

describe('R7. 점은 그날 투두가 있는 카테고리 색을 최대 3개, 4개 이상이면 3개 + "+n" 이다', () => {
  it('카테고리 3개면 점 3개에 넘침이 없다', () => {
    const categories = makeCategories(3);
    const todos = categories.map((c, i) => makeTodo({ seq: i + 1, date: DAY, categoryId: c.id }));
    const summary = summaryOf(WEEK, todos, categories, DAY);
    expect(summary.dots.map((d) => d.color)).toEqual(categories.map((c) => c.color));
    expect(summary.overflowCount).toBe(0);
  });

  it('카테고리 5개면 점 3개 + 넘침 2 다', () => {
    const categories = makeCategories(5);
    const todos = categories.map((c, i) => makeTodo({ seq: i + 1, date: DAY, categoryId: c.id }));
    const summary = summaryOf(WEEK, todos, categories, DAY);
    expect(summary.dots).toHaveLength(MAX_DOTS);
    expect(summary.overflowCount).toBe(2);
  });

  it('같은 카테고리 투두가 여러 건이어도 점은 1개다', () => {
    const category = makeCategory();
    const todos = [1, 2, 3].map((seq) => makeTodo({ seq, date: DAY, categoryId: category.id }));
    expect(summaryOf(WEEK, todos, [category], DAY).dots).toHaveLength(1);
  });

  it('점 순서는 저장소가 준 카테고리 순서(활성 order → 종료)를 따른다', () => {
    const active = makeCategory({ seq: 1 });
    const closed = makeCategory({
      seq: 2,
      status: 'completed',
      closedAt: '2026-09-01T00:00:00.000Z',
    });
    // 저장소는 활성을 먼저, 종료를 뒤에 준다 — 투두 순서가 반대여도 점 순서는 카테고리 순서다.
    const todos = [
      makeTodo({ seq: 1, date: DAY, categoryId: closed.id }),
      makeTodo({ seq: 2, date: DAY, categoryId: active.id }),
    ];
    expect(summaryOf(WEEK, todos, [active, closed], DAY).dots.map((d) => d.color)).toEqual([
      active.color,
      closed.color,
    ]);
  });

  it('삭제된 카테고리(저장소가 모르는 id)는 맨 뒤에 중립색 점으로 남는다', () => {
    const active = makeCategory({ seq: 1 });
    const todos = [
      makeTodo({ seq: 1, date: DAY, categoryId: 'gone' }),
      makeTodo({ seq: 2, date: DAY, categoryId: active.id }),
    ];
    expect(summaryOf(WEEK, todos, [active], DAY).dots).toEqual([
      { categoryId: active.id, color: active.color },
      { categoryId: 'gone', color: DELETED_CATEGORY_COLOR },
    ]);
  });

  it('투두가 없는 날은 점이 없다', () => {
    const summary = summaryOf(WEEK, [], [], '2026-09-16');
    expect(summary.dots).toEqual([]);
    expect(summary.total).toBe(0);
  });

  it('주 안의 각 날짜가 자기 투두만 센다', () => {
    const category = makeCategory();
    const todos = [
      makeTodo({ seq: 1, date: '2026-09-15', categoryId: category.id }),
      makeTodo({ seq: 2, date: DAY, categoryId: category.id }),
      makeTodo({ seq: 3, date: DAY, categoryId: category.id }),
    ];
    const week = summarizeWeek(WEEK, todos, [category]);
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
    const summary = summaryOf(WEEK, todos, [category], DAY);
    expect(summary.isAllDone).toBe(true);
    expect(summary.doneCount).toBe(2);
  });

  it('하나라도 남아 있으면 배지가 없다', () => {
    const category = makeCategory();
    const todos = [
      makeTodo({ seq: 1, date: DAY, categoryId: category.id, done: true }),
      makeTodo({ seq: 2, date: DAY, categoryId: category.id, done: false }),
    ];
    expect(summaryOf(WEEK, todos, [category], DAY).isAllDone).toBe(false);
  });

  it('투두가 0개인 날은 배지가 없다(빈 날을 완료로 치지 않는다)', () => {
    expect(summaryOf(WEEK, [], [], DAY).isAllDone).toBe(false);
  });
});
