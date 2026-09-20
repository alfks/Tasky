import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import {
  FOCUS_OTHER_KEY,
  buildReportsPeriodData,
  heatmapLevel,
} from '@/features/reports/lib/period-summary';
import { makeCategories, makeCategory } from '@/test/fixtures/category';
import { makeFocusSession } from '@/test/fixtures/focus-session';
import { makeTodo } from '@/test/fixtures/todo';

const PERIOD_DAYS: DateKey[] = ['2026-09-18', '2026-09-19', '2026-09-20'];
/** 기간 밖 날짜 하나를 포함해 히트맵이 union 범위에서 따로 읽는지도 확인한다. */
const HEATMAP_DAYS: DateKey[][] = [['2026-09-11', ...PERIOD_DAYS]];

describe('buildReportsPeriodData — 재사용 확인 (R2·R3·R6)', () => {
  it('추이는 summarizeDays 결과를 그대로 쓴다: 투두 0개 날은 null(빈 칸), 있는 날은 비율', () => {
    const category = makeCategory();
    const todos = [
      makeTodo({ seq: 1, date: '2026-09-19', categoryId: category.id, done: true }),
      makeTodo({ seq: 2, date: '2026-09-19', categoryId: category.id, done: false }),
    ];

    const data = buildReportsPeriodData({
      period: { from: PERIOD_DAYS[0], to: PERIOD_DAYS[2] },
      periodDays: PERIOD_DAYS,
      heatmapDays: HEATMAP_DAYS,
      todos,
      categories: [category],
      focusSessions: [],
    });

    expect(data.trend).toEqual([
      { date: '2026-09-18', ratio: null },
      { date: '2026-09-19', ratio: 0.5 },
      { date: '2026-09-20', ratio: null },
    ]);
  });

  it('카테고리 비율은 summarizeByCategory 를 기간 전체 투두에 한 번 넘긴 결과와 같다', () => {
    const [catA, catB] = makeCategories(2);
    const todos = [
      makeTodo({ seq: 1, date: '2026-09-18', categoryId: catA.id, done: true }),
      makeTodo({ seq: 2, date: '2026-09-20', categoryId: catA.id, done: false }),
      makeTodo({ seq: 3, date: '2026-09-19', categoryId: catB.id, done: true }),
    ];

    const data = buildReportsPeriodData({
      period: { from: PERIOD_DAYS[0], to: PERIOD_DAYS[2] },
      periodDays: PERIOD_DAYS,
      heatmapDays: HEATMAP_DAYS,
      todos,
      categories: [catA, catB],
      focusSessions: [],
    });

    // catA 는 두 날짜에 걸쳐 있어도 한 줄로 합산된다(기간 전체를 한 번에 넘긴 결과라는 증거).
    expect(data.categoryBars).toEqual([
      { categoryId: catA.id, done: 1, total: 2 },
      { categoryId: catB.id, done: 1, total: 1 },
    ]);
  });

  it('히트맵은 기간 밖 날짜도 union 범위에서 읽어 채운다(R6·R7)', () => {
    const category = makeCategory();
    const todos = [
      makeTodo({ seq: 1, date: '2026-09-11', categoryId: category.id, done: true }), // 기간 밖, 히트맵만
    ];

    const data = buildReportsPeriodData({
      period: { from: PERIOD_DAYS[0], to: PERIOD_DAYS[2] },
      periodDays: PERIOD_DAYS,
      heatmapDays: HEATMAP_DAYS,
      todos,
      categories: [category],
      focusSessions: [],
    });

    expect(data.heatmap[0]?.[0]).toEqual({
      date: '2026-09-11',
      level: 4,
      total: 1,
      doneCount: 1,
    });
    // 기간 안이지만 투두가 없는 날은 "기록 없음"(레벨 0).
    expect(data.heatmap[0]?.[1]).toEqual({
      date: '2026-09-18',
      level: 0,
      total: 0,
      doneCount: 0,
    });
  });
});

describe('buildReportsPeriodData — 스트릭 (R4)', () => {
  it('마지막 날(기준일)이 미완료면 0이다', () => {
    const category = makeCategory();
    const todos = [
      makeTodo({ seq: 1, date: '2026-09-18', categoryId: category.id, done: true }),
      makeTodo({ seq: 2, date: '2026-09-19', categoryId: category.id, done: true }),
      makeTodo({ seq: 3, date: '2026-09-20', categoryId: category.id, done: false }),
    ];

    const data = buildReportsPeriodData({
      period: { from: PERIOD_DAYS[0], to: PERIOD_DAYS[2] },
      periodDays: PERIOD_DAYS,
      heatmapDays: HEATMAP_DAYS,
      todos,
      categories: [category],
      focusSessions: [],
    });

    expect(data.streak).toBe(0);
  });

  it('마지막 날이 투두 0개면 건너뛰고 그 전날로 이어진다', () => {
    const category = makeCategory();
    const todos = [
      makeTodo({ seq: 1, date: '2026-09-18', categoryId: category.id, done: true }),
      makeTodo({ seq: 2, date: '2026-09-19', categoryId: category.id, done: true }),
      // 2026-09-20 은 투두가 없다.
    ];

    const data = buildReportsPeriodData({
      period: { from: PERIOD_DAYS[0], to: PERIOD_DAYS[2] },
      periodDays: PERIOD_DAYS,
      heatmapDays: HEATMAP_DAYS,
      todos,
      categories: [category],
      focusSessions: [],
    });

    expect(data.streak).toBe(2);
  });
});

describe('buildReportsPeriodData — 집중 시간 (R5)', () => {
  it('completed·canceled 세션만 더하고, 투두별 상위 5개 + 나머지는 기타로 합친다', () => {
    const sessions = [
      ...Array.from({ length: 6 }, (_, i) =>
        makeFocusSession({
          seq: i + 1,
          todoId: `todo-${i}`,
          status: 'completed',
          elapsedSeconds: 600 - i * 10, // 내림차순이 되게: 600,590,...,550
          date: '2026-09-19',
        }),
      ),
      makeFocusSession({ seq: 100, status: 'running', elapsedSeconds: 9999, date: '2026-09-19' }),
    ];

    const data = buildReportsPeriodData({
      period: { from: PERIOD_DAYS[0], to: PERIOD_DAYS[2] },
      periodDays: PERIOD_DAYS,
      heatmapDays: HEATMAP_DAYS,
      todos: [],
      categories: [],
      focusSessions: sessions,
    });

    expect(data.focusTotalSeconds).toBe(600 + 590 + 580 + 570 + 560 + 550);
    expect(data.focusByTodo).toHaveLength(6); // 상위 5 + 기타 1
    expect(data.focusByTodo[0]).toEqual({ key: 'todo-0', seconds: 600 });
    expect(data.focusByTodo.at(-1)).toEqual({ key: FOCUS_OTHER_KEY, seconds: 550 });
  });

  it('todoTitles 는 읽어 온 투두의 id → 제목 조회표다', () => {
    const todo = makeTodo({ seq: 1, date: '2026-09-19', title: '장보기' });

    const data = buildReportsPeriodData({
      period: { from: PERIOD_DAYS[0], to: PERIOD_DAYS[2] },
      periodDays: PERIOD_DAYS,
      heatmapDays: HEATMAP_DAYS,
      todos: [todo],
      categories: [],
      focusSessions: [],
    });

    expect(data.todoTitles.get(todo.id)).toBe('장보기');
  });
});

describe('heatmapLevel (완료 조건: 5단계 매핑)', () => {
  it('기록 없음(undefined 또는 total 0) → 0', () => {
    expect(heatmapLevel(undefined)).toBe(0);
    expect(
      heatmapLevel({ total: 0, doneCount: 0, isAllDone: false, dots: [], overflowCount: 0 }),
    ).toBe(0);
  });

  it('0% 완료 → 1', () => {
    expect(
      heatmapLevel({ total: 4, doneCount: 0, isAllDone: false, dots: [], overflowCount: 0 }),
    ).toBe(1);
  });

  it('1~49% 완료 → 2', () => {
    expect(
      heatmapLevel({ total: 4, doneCount: 1, isAllDone: false, dots: [], overflowCount: 0 }),
    ).toBe(2);
  });

  it('50~99% 완료 → 3', () => {
    expect(
      heatmapLevel({ total: 4, doneCount: 2, isAllDone: false, dots: [], overflowCount: 0 }),
    ).toBe(3);
    expect(
      heatmapLevel({ total: 4, doneCount: 3, isAllDone: false, dots: [], overflowCount: 0 }),
    ).toBe(3);
  });

  it('100% 완료 → 4', () => {
    expect(
      heatmapLevel({ total: 4, doneCount: 4, isAllDone: true, dots: [], overflowCount: 0 }),
    ).toBe(4);
  });
});
