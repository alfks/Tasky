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
 * 저장소 조회는 이 범위로 **한 번만** 하고, 추이·카테고리·스트릭·히트맵 전부 그 결과에서 걸러 쓴다.
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
