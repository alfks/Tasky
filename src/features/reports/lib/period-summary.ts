// 화면 모델 합성 (stats.md). **새 요약 함수를 만들지 않는다** — 추이·히트맵은 `day-summary.ts`
// 의 `summarizeDays`, 카테고리 비율은 `completion-rate.ts` 의 `summarizeByCategory` 를 그대로
// 부르고, 이 파일은 그 결과를 화면이 쓸 모양으로만 자른다. 신규 계산은 스트릭·집중 시간 합계
// 둘뿐이고 그것도 domain 함수(`computeStreak`·`summarizeFocusSeconds`) 호출일 뿐이다.
import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { FocusSession } from '@/domain/focus/focus-session';
import { summarizeByCategory, type CategoryCompletion } from '@/domain/todo/completion-rate';
import { summarizeDays, type DaySummary } from '@/domain/todo/day-summary';
import { FOCUS_SUMMARY_NONE_KEY, summarizeFocusSeconds } from '@/domain/todo/focus-summary';
import { computeStreak } from '@/domain/todo/streak';
import type { Todo } from '@/domain/todo/todo';

import type { PeriodRange } from '@/features/reports/lib/period';

export type TrendPoint = { date: DateKey; ratio: number | null };
/** 히트맵 5단계(theme.md §3-H). 0=기록 없음 · 4=100%. */
export type HeatmapLevel = 0 | 1 | 2 | 3 | 4;
export type HeatmapCell = { date: DateKey; level: HeatmapLevel; total: number; doneCount: number };
export type FocusBucket = { key: string; seconds: number };

/** "기타" 로 합쳐지기 전 상위 항목 수(§2 "투두별 상위 5개 + 나머지 '기타'"). */
export const FOCUS_TOP_N = 5;
/** 상위 N 밖으로 밀린 나머지가 모이는 키. `FOCUS_SUMMARY_NONE_KEY`("할 일 없이 집중")와는 다른 축이다. */
export const FOCUS_OTHER_KEY = '__other__';

export type ReportsPeriodData = {
  trend: TrendPoint[];
  streak: number;
  categoryBars: CategoryCompletion[];
  focusTotalSeconds: number;
  focusByTodo: FocusBucket[];
  /** `focusByTodo` 의 키(투두 id)를 화면이 읽을 제목으로. 집계 범위 밖 투두는 없을 수 있다(화면이 대체 문구로 채운다). */
  todoTitles: ReadonlyMap<string, string>;
  heatmap: HeatmapCell[][];
};

type BuildInput = {
  period: PeriodRange;
  periodDays: readonly DateKey[];
  heatmapDays: readonly DateKey[][];
  /** 기간 ∪ 히트맵 범위를 한 번 읽은 결과(R7) — 여기서 다시 조회하지 않는다. */
  todos: readonly Todo[];
  categories: readonly Category[];
  /** 기간 범위만 읽은 결과(R7) — 히트맵은 세션을 쓰지 않는다. */
  focusSessions: readonly FocusSession[];
};

function trendOf(
  periodDays: readonly DateKey[],
  summaries: ReadonlyMap<DateKey, DaySummary>,
): TrendPoint[] {
  return periodDays.map((date) => {
    const summary = summaries.get(date);
    // total === 0 인 날은 빈 칸이다(R2) — 0% 와 다른 상태.
    if (summary === undefined || summary.total === 0) return { date, ratio: null };
    return { date, ratio: summary.doneCount / summary.total };
  });
}

/** 히트맵 5단계 매핑(완료 조건: 기록 없음→0, 0%→1, 1~49%→2, 50~99%→3, 100%→4). */
export function heatmapLevel(summary: DaySummary | undefined): HeatmapLevel {
  if (summary === undefined || summary.total === 0) return 0;
  const rate = summary.doneCount / summary.total;
  if (rate === 0) return 1;
  if (rate < 0.5) return 2;
  if (rate < 1) return 3;
  return 4;
}

function heatmapOf(
  weeks: readonly DateKey[][],
  summaries: ReadonlyMap<DateKey, DaySummary>,
): HeatmapCell[][] {
  return weeks.map((week) =>
    week.map((date) => {
      const summary = summaries.get(date);
      return {
        date,
        level: heatmapLevel(summary),
        total: summary?.total ?? 0,
        doneCount: summary?.doneCount ?? 0,
      };
    }),
  );
}

/** 상위 `FOCUS_TOP_N` + 나머지 "기타"(§2). 내림차순, 동률은 키 오름차순(결정적 순서). */
function topFocusBuckets(totals: ReadonlyMap<string, number>): FocusBucket[] {
  const sorted = [...totals.entries()]
    .map(([key, seconds]) => ({ key, seconds }))
    .sort((a, b) => b.seconds - a.seconds || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
  if (sorted.length <= FOCUS_TOP_N) return sorted;
  const top = sorted.slice(0, FOCUS_TOP_N);
  const restSeconds = sorted.slice(FOCUS_TOP_N).reduce((sum, bucket) => sum + bucket.seconds, 0);
  return [...top, { key: FOCUS_OTHER_KEY, seconds: restSeconds }];
}

/**
 * 화면이 쓰는 모든 카드 데이터를 한 번에 만든다. 저장소는 다시 읽지 않는다(R7) — `todos`·
 * `categories`·`focusSessions` 는 훅이 이미 읽어 온 것을 그대로 받는다.
 */
export function buildReportsPeriodData(input: BuildInput): ReportsPeriodData {
  const { period, periodDays, heatmapDays, todos, categories, focusSessions } = input;

  // 추이·스트릭·히트맵이 같은 summarizeDays 결과를 나눠 쓴다 — 날짜별 요약을 두 번 만들지 않는다.
  const summaryDays = [...new Set([...periodDays, ...heatmapDays.flat()])];
  const summaries = summarizeDays(summaryDays, todos, categories);

  const periodTodos = todos.filter((todo) => todo.date >= period.from && todo.date <= period.to);
  const focusTotals = summarizeFocusSeconds(focusSessions, 'todo');

  return {
    trend: trendOf(periodDays, summaries),
    streak: computeStreak(periodDays.map((date) => summaries.get(date) ?? EMPTY_DAY)),
    categoryBars: summarizeByCategory(periodTodos, categories),
    focusTotalSeconds: [...focusTotals.values()].reduce((sum, seconds) => sum + seconds, 0),
    focusByTodo: topFocusBuckets(focusTotals),
    todoTitles: new Map(todos.map((todo) => [todo.id, todo.title])),
    heatmap: heatmapOf(heatmapDays, summaries),
  };
}

/** `summaries.get(date)` 가 없을 때(이론상 없음 — `periodDays` 는 항상 `summaryDays` 의 부분집합). */
const EMPTY_DAY: Pick<DaySummary, 'total' | 'isAllDone'> = { total: 0, isAllDone: false };

export { FOCUS_SUMMARY_NONE_KEY };
