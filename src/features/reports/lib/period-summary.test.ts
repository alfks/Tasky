import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { datesInRange, heatmapWeeks, streakWindowRange } from '@/features/reports/lib/period';
import {
  FOCUS_OTHER_KEY,
  buildReportsPeriodData,
  heatmapLevel,
} from '@/features/reports/lib/period-summary';
import { makeCategories, makeCategory } from '@/test/fixtures/category';
import { makeFocusSession } from '@/test/fixtures/focus-session';
import { makeTodo } from '@/test/fixtures/todo';

import { addDays } from '@/lib/date';

const PERIOD_DAYS: DateKey[] = ['2026-09-18', '2026-09-19', '2026-09-20'];
/** 기간 밖 날짜 하나를 포함해 히트맵이 union 범위에서 따로 읽는지도 확인한다. */
const HEATMAP_DAYS: DateKey[][] = [['2026-09-11', ...PERIOD_DAYS]];
/** review 라운드2 m19 — 실제 구현은 `streakWindowRange`(고정 길이)를 쓰지만, 이 픽스처들은 전부
 * `heatmapDays.flat()` 이 이미 스트릭에 필요한 날짜를 덮으므로 그대로 스트릭 창으로 재사용한다. */
const STREAK_DAYS: DateKey[] = HEATMAP_DAYS.flat();

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
      today: PERIOD_DAYS[2],
      streakDays: STREAK_DAYS,
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
      today: PERIOD_DAYS[2],
      streakDays: STREAK_DAYS,
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
      today: PERIOD_DAYS[2],
      streakDays: STREAK_DAYS,
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
      today: PERIOD_DAYS[2],
      streakDays: STREAK_DAYS,
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
      today: PERIOD_DAYS[2],
      streakDays: STREAK_DAYS,
      todos,
      categories: [category],
      focusSessions: [],
    });

    expect(data.streak).toBe(2);
  });

  it('선택한 기간(periodDays)을 바꿔도 스트릭은 그대로다 — today·heatmapDays 로만 정해진다(review M1)', () => {
    const category = makeCategory();
    const todos = [
      makeTodo({ seq: 1, date: '2026-09-18', categoryId: category.id, done: true }),
      makeTodo({ seq: 2, date: '2026-09-19', categoryId: category.id, done: true }),
      makeTodo({ seq: 3, date: '2026-09-20', categoryId: category.id, done: true }),
    ];
    const heatmapDays = HEATMAP_DAYS;
    const today = PERIOD_DAYS[2];

    // "지난 1일" 처럼 기간을 하루로 좁혀도(짧은 기간)...
    const short = buildReportsPeriodData({
      period: { from: today, to: today },
      periodDays: [today],
      heatmapDays,
      today,
      streakDays: STREAK_DAYS,
      todos,
      categories: [category],
      focusSessions: [],
    });
    // ...기간을 3일로 넓혀도 스트릭 숫자는 같다 — 기간이 아니라 항상 고정 스트릭 창에서만 센다.
    const long = buildReportsPeriodData({
      period: { from: PERIOD_DAYS[0], to: PERIOD_DAYS[2] },
      periodDays: PERIOD_DAYS,
      heatmapDays,
      today,
      streakDays: STREAK_DAYS,
      todos,
      categories: [category],
      focusSessions: [],
    });

    expect(short.streak).toBe(long.streak);
    expect(short.streak).toBe(3);
  });

  it('todayTotal·todayIsAllDone 은 오늘 하루의 값을 그대로 옮긴다(review M4 재현: 2개 중 1개만 완료)', () => {
    const category = makeCategory();
    const today = PERIOD_DAYS[2];
    const todos = [
      makeTodo({ seq: 1, date: today, categoryId: category.id, done: true }),
      makeTodo({ seq: 2, date: today, categoryId: category.id, done: false }),
    ];

    const data = buildReportsPeriodData({
      period: { from: PERIOD_DAYS[0], to: PERIOD_DAYS[2] },
      periodDays: PERIOD_DAYS,
      heatmapDays: HEATMAP_DAYS,
      today,
      streakDays: STREAK_DAYS,
      todos,
      categories: [category],
      focusSessions: [],
    });

    expect(data.streak).toBe(0); // 오늘 미완료라 스트릭은 0(정상)
    expect(data.todayTotal).toBe(2); // 그런데 오늘 투두는 2개 있다 — "기록 없음"이 아니다
    expect(data.todayIsAllDone).toBe(false);
  });

  it('84일 넘는 연속 완료가 today 의 요일과 무관하게 같은 숫자로 나온다(review 라운드2 m19)', () => {
    // 재현: heatmapDays(월요일 시작 12주)를 그대로 스트릭 창으로 썼다면, today 가 월요일일 때
    // 실제 날 수가 78일뿐이라 80일째 연속 완료가 78로 잘렸다 — 이력은 안 변했는데 숫자만 요일 따라
    // 바뀌는 버그. 이제는 `streakWindowRange`(고정 84일)를 쓰므로 어느 요일이든 80으로 같다.
    const STREAK_LEN = 80;
    const sunday: DateKey = '2026-09-20'; // 일요일
    const monday: DateKey = '2026-09-21'; // 월요일 — heatmapWeeks 필터 후 78일뿐인 날
    const category = makeCategory();

    function build(today: DateKey) {
      const window = streakWindowRange(today);
      const streakDays = datesInRange(window.from, window.to);
      const heatmapDays = heatmapWeeks(today);
      // today 로 끝나는 80일 연속 완료 이력.
      const todos = Array.from({ length: STREAK_LEN }, (_, i) =>
        makeTodo({ seq: i + 1, date: addDays(today, -i), categoryId: category.id, done: true }),
      );
      return buildReportsPeriodData({
        period: { from: today, to: today },
        periodDays: [today],
        heatmapDays,
        today,
        streakDays,
        todos,
        categories: [category],
        focusSessions: [],
      });
    }

    expect(build(sunday).streak).toBe(STREAK_LEN);
    expect(build(monday).streak).toBe(STREAK_LEN);
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
      today: PERIOD_DAYS[2],
      streakDays: STREAK_DAYS,
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
      today: PERIOD_DAYS[2],
      streakDays: STREAK_DAYS,
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
