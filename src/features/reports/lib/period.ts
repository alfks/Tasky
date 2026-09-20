// 기간 프리셋·범위 계산 (stats.md R1·R6). `@/lib/date` 의 순수 날짜 산술만 쓴다 — 시계를 직접 읽지
// 않고(테스트 결정성), 호출부가 `todayKey()` 를 넘긴다.
import { addDays, startOfWeek, type DateKey } from '@/lib/date';

/** 탭형 토글의 네 선택지(R1). `custom` 은 `input[type=date]` 두 개로 고른다. */
export type PeriodPreset = 'last7' | 'last30' | 'thisYear' | 'custom';

export type PeriodRange = { from: DateKey; to: DateKey };

/** 기간 지정(custom)의 최대 길이(R1). */
export const CUSTOM_RANGE_MAX_DAYS = 366;

/** 히트맵이 보여주는 주 수(R6, "최근 12주"). */
export const HEATMAP_WEEKS = 12;

/** 프리셋(`custom` 제외)을 `today` 기준 실제 범위로 바꾼다. */
export function presetRange(preset: Exclude<PeriodPreset, 'custom'>, today: DateKey): PeriodRange {
  if (preset === 'last7') return { from: addDays(today, -6), to: today };
  if (preset === 'last30') return { from: addDays(today, -29), to: today };
  const year = today.slice(0, 4);
  return { from: `${year}-01-01` as DateKey, to: today };
}

/** 두 DateKey 사이의 날짜 수(**양끝 포함**). `from > to` 면 음수다 — 호출부가 먼저 순서를 검사한다. */
export function daysBetween(from: DateKey, to: DateKey): number {
  const MS_PER_DAY = 86_400_000;
  const fromMs = new Date(`${from}T00:00:00`).getTime();
  const toMs = new Date(`${to}T00:00:00`).getTime();
  return Math.round((toMs - fromMs) / MS_PER_DAY) + 1;
}

/** 기간 지정(custom)이 유효한 범위인가(R1: 정순 + 최대 366일). */
export function isValidCustomRange(from: DateKey, to: DateKey): boolean {
  return from <= to && daysBetween(from, to) <= CUSTOM_RANGE_MAX_DAYS;
}

/** `from`~`to`(양끝 포함)의 모든 DateKey를 오름차순으로. DateKey 는 사전순 = 날짜순이다(lib/date.ts). */
export function datesInRange(from: DateKey, to: DateKey): DateKey[] {
  const days: DateKey[] = [];
  let cursor = from;
  while (cursor <= to) {
    days.push(cursor);
    cursor = addDays(cursor, 1);
  }
  return days;
}

/**
 * 히트맵 격자(R6): `today` 가 속한 주(월요일 시작)까지 포함해 최근 `HEATMAP_WEEKS` 주.
 * `weeks[0]` 이 가장 오래된 주, 각 주는 월→일 7일이다. `today` 이후 날짜도 배열엔 있다 —
 * "오늘 이후 칸은 렌더하지 않는다"는 화면(컴포넌트)의 책임이다.
 */
export function heatmapWeeks(today: DateKey): DateKey[][] {
  const thisWeekMonday = startOfWeek(today);
  const firstMonday = addDays(thisWeekMonday, -(HEATMAP_WEEKS - 1) * 7);
  return Array.from({ length: HEATMAP_WEEKS }, (_, week) => {
    const monday = addDays(firstMonday, week * 7);
    return Array.from({ length: 7 }, (_, day) => addDays(monday, day));
  });
}

/**
 * 선택 기간과 히트맵(항상 최근 12주)을 함께 덮는 가장 작은 범위 — R7 "각각 한 번씩 읽는다"의 근거다.
 * 두 범위가 붙어 있거나 겹칠 때만 쓴다(review M2, `shouldSplitTodoFetch` 참고) — 멀리 떨어져 있으면
 * 이 범위가 그 사이 빈 구간까지 통째로 읽어 버린다.
 */
export function unionFetchRange(period: PeriodRange, heatmap: readonly DateKey[][]): PeriodRange {
  const dates = [period.from, period.to, ...heatmap.flat()];
  return dates.reduce(
    (range, date) => ({
      from: date < range.from ? date : range.from,
      to: date > range.to ? date : range.to,
    }),
    { from: period.from, to: period.to },
  );
}

/** `heatmapDays` 격자 전체가 걸치는 최소~최대 범위(review M2). */
export function heatmapDataRange(heatmap: readonly DateKey[][]): PeriodRange {
  const flat = heatmap.flat();
  const first = flat[0];
  if (first === undefined) return { from: '' as DateKey, to: '' as DateKey }; // heatmap 은 항상 84일이라 이론상 없음
  return flat.reduce(
    (range, date) => ({
      from: date < range.from ? date : range.from,
      to: date > range.to ? date : range.to,
    }),
    { from: first, to: first },
  );
}

/** 두 범위를 함께 덮는 가장 작은 범위. */
export function mergeRanges(a: PeriodRange, b: PeriodRange): PeriodRange {
  return {
    from: a.from < b.from ? a.from : b.from,
    to: a.to > b.to ? a.to : b.to,
  };
}

/**
 * 스트릭 계산 창의 고정 길이(review 라운드2 m19). 히트맵과 같은 84일(`HEATMAP_WEEKS`×7)이지만
 * `heatmapWeeks` 처럼 월요일에 맞추지 않는다 — 맞추면 실제 날 수가 `today` 가 무슨 요일이냐에
 * 따라 78~84일로 흔들린다(오늘이 월요일이면 이번 주는 1일치만 포함되므로). 84일 넘는 스트릭은
 * 그러면 **이력이 안 변했는데도** 월요일마다 숫자가 줄었다 늘었다 한다 — 요일과 무관하게 항상
 * 같은 길이여야 한다.
 */
export const STREAK_WINDOW_DAYS = HEATMAP_WEEKS * 7;

/** `today` 로 끝나는 고정 `STREAK_WINDOW_DAYS`일 범위(양끝 포함). 히트맵 격자(요일 정렬)와 별개다. */
export function streakWindowRange(today: DateKey): PeriodRange {
  return { from: addDays(today, -(STREAK_WINDOW_DAYS - 1)), to: today };
}

/**
 * 기간과 히트맵 범위를 **나눠서** 읽어야 하는가(review M2).
 *
 * `isValidCustomRange` 는 길이(366일)만 보고 위치는 안 본다 — `custom` 으로 먼 과거(예: 2015년)를
 * 고르면 `unionFetchRange` 가 그 구간과 "항상 최근 12주"인 히트맵 사이 수천 일의 빈 구간까지
 * 한 범위로 묶어 통째로 읽는다(실측: 2015년 선택 시 union ≈ 4,280일, 실제 필요한 건 450일뿐).
 *
 * 두 범위가 겹치거나 하루도 비지 않고 맞닿아 있으면(프리셋 경로는 항상 이 경우다 — `period.to`
 * 가 `today`이고 히트맵은 항상 `today`를 포함한다) union 이 실제로 읽는 날 전부를 필요로 하므로
 * 그대로 1회가 더 싸다. 최소 하루라도 비면 그 구간만큼 union 이 손해라 두 범위를 따로 읽는 편이
 * 낫다(투두 조회 2회, R7 의 "날짜마다 조회하지 않는다"는 취지는 지킨다 — 여전히 범위 조회다).
 */
export function shouldSplitTodoFetch(period: PeriodRange, heatmapRange: PeriodRange): boolean {
  if (period.to < heatmapRange.from) return addDays(period.to, 1) < heatmapRange.from;
  if (heatmapRange.to < period.from) return addDays(heatmapRange.to, 1) < period.from;
  return false;
}
