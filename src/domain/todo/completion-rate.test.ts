import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import {
  completionCounts,
  completionPercent,
  completionRate,
  summarizeByCategory,
  summarizeWeek,
} from '@/domain/todo/completion-rate';

import { makeCategory } from '@/test/fixtures/category';
import { makeTodos } from '@/test/fixtures/todo';

const withDone = (total: number, done: number) =>
  makeTodos(total, (i) => ({ done: i < done, categoryId: 'c1' }));

describe('completionRate / completionCounts (R1)', () => {
  it('투두가 0개면 null 이다', () => {
    expect(completionRate([])).toBeNull();
    expect(completionCounts([])).toEqual({ done: 0, total: 0 });
  });

  it('카테고리 상태와 무관하게 그날의 모든 투두를 센다', () => {
    const todos = [
      ...makeTodos(2, () => ({ categoryId: 'active', done: true })),
      ...makeTodos(1, () => ({ categoryId: 'closed' })),
      ...makeTodos(1, () => ({ categoryId: 'deleted' })),
    ];
    expect(completionCounts(todos)).toEqual({ done: 2, total: 4 });
    expect(completionRate(todos)).toBe(0.5);
  });
});

describe('completionPercent (R2)', () => {
  it('경계값', () => {
    expect(completionPercent([])).toBeNull();
    expect(completionPercent(withDone(3, 1))).toBe(33);
    expect(completionPercent(withDone(3, 2))).toBe(67);
    expect(completionPercent(withDone(200, 199))).toBe(99);
    expect(completionPercent(withDone(200, 200))).toBe(100);
  });

  it('반올림이 100 이 되어도 전부 완료가 아니면 99 로 낮춘다', () => {
    expect(completionPercent(withDone(1000, 999))).toBe(99);
  });
});

describe('summarizeByCategory (R5)', () => {
  it('활성 order → 종료 closedAt 내림차순 → 삭제됨 순으로 나온다', () => {
    const active2 = makeCategory({ seq: 1, order: 1 });
    const active1 = makeCategory({ seq: 2, order: 0 });
    const closedOld = makeCategory({
      seq: 3,
      status: 'completed',
      closedAt: '2026-01-01T00:00:00.000Z',
    });
    const closedNew = makeCategory({
      seq: 4,
      status: 'paused',
      closedAt: '2026-01-10T00:00:00.000Z',
    });
    const removed = makeCategory({ seq: 5, deletedAt: '2026-01-12T00:00:00.000Z' });
    const categories = [active2, active1, closedOld, closedNew, removed];
    const todos = categories.flatMap((c) =>
      makeTodos(2, (i) => ({ categoryId: c.id, done: i === 0 })),
    );

    expect(summarizeByCategory(todos, categories).map((s) => s.categoryId)).toEqual([
      active1.id,
      active2.id,
      closedNew.id,
      closedOld.id,
      removed.id,
    ]);
  });

  it('그날 투두가 없는 카테고리는 빠지고, 모르는 categoryId 는 뒤에 붙는다', () => {
    const known = makeCategory({ seq: 1 });
    const empty = makeCategory({ seq: 2 });
    const todos = [
      ...makeTodos(2, (i) => ({ categoryId: known.id, done: i === 0 })),
      ...makeTodos(1, () => ({ categoryId: 'ghost' })),
    ];
    expect(summarizeByCategory(todos, [known, empty])).toEqual([
      { categoryId: known.id, done: 1, total: 2 },
      { categoryId: 'ghost', done: 0, total: 1 },
    ]);
  });
});

describe('summarizeWeek (R8 · date-strip R8)', () => {
  it('날짜별 완료/전체와 등장 카테고리를 모은다', () => {
    const todos = [
      ...makeTodos(2, (i) => ({ categoryId: 'a', done: i === 0 })),
      ...makeTodos(1, () => ({ date: '2026-01-16' as DateKey, categoryId: 'b' })),
      ...makeTodos(1, () => ({ date: '2026-01-16' as DateKey, categoryId: 'a', done: true })),
    ];
    const week = summarizeWeek(todos);
    expect(week.get('2026-01-15' as DateKey)).toEqual({ done: 1, total: 2, categoryIds: ['a'] });
    expect(week.get('2026-01-16' as DateKey)).toEqual({
      done: 1,
      total: 2,
      categoryIds: ['b', 'a'],
    });
  });

  it('투두가 없으면 빈 Map', () => {
    expect(summarizeWeek([]).size).toBe(0);
  });
});
