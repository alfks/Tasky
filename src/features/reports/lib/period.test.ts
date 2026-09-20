import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import {
  CUSTOM_RANGE_MAX_DAYS,
  HEATMAP_WEEKS,
  STREAK_WINDOW_DAYS,
  daysBetween,
  datesInRange,
  heatmapDataRange,
  heatmapWeeks,
  isValidCustomRange,
  mergeRanges,
  presetRange,
  shouldSplitTodoFetch,
  streakWindowRange,
  unionFetchRange,
} from '@/features/reports/lib/period';

const TODAY = '2026-09-20'; // 일요일

describe('presetRange (stats.md R1)', () => {
  it('last7 은 오늘 포함 7일이다', () => {
    expect(presetRange('last7', TODAY)).toEqual({ from: '2026-09-14', to: TODAY });
  });

  it('last30 은 오늘 포함 30일이다', () => {
    expect(presetRange('last30', TODAY)).toEqual({ from: '2026-08-22', to: TODAY });
  });

  it('thisYear 는 1/1부터 오늘까지다', () => {
    expect(presetRange('thisYear', TODAY)).toEqual({ from: '2026-01-01', to: TODAY });
  });
});

describe('daysBetween·isValidCustomRange (R1)', () => {
  it('최대 길이는 366일이다', () => {
    expect(CUSTOM_RANGE_MAX_DAYS).toBe(366);
  });

  it('같은 날이면 1일이다(양끝 포함)', () => {
    expect(daysBetween(TODAY, TODAY)).toBe(1);
  });

  it('366일까지는 유효하다', () => {
    expect(isValidCustomRange('2025-09-21', '2026-09-20')).toBe(true);
  });

  it('366일을 넘으면 무효다', () => {
    expect(isValidCustomRange('2025-09-19', '2026-09-20')).toBe(false);
  });

  it('from 이 to 보다 뒤면 무효다', () => {
    expect(isValidCustomRange('2026-09-21', '2026-09-20')).toBe(false);
  });
});

describe('datesInRange', () => {
  it('양끝을 포함해 오름차순으로 나열한다', () => {
    expect(datesInRange('2026-09-18', '2026-09-20')).toEqual([
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
  });

  it('from === to 면 원소 하나다', () => {
    expect(datesInRange(TODAY, TODAY)).toEqual([TODAY]);
  });
});

describe('heatmapWeeks (R6, "최근 12주")', () => {
  it('12주 × 7일 격자를 만든다', () => {
    const weeks = heatmapWeeks(TODAY);
    expect(weeks).toHaveLength(HEATMAP_WEEKS);
    for (const week of weeks) expect(week).toHaveLength(7);
  });

  it('각 주는 월요일에 시작한다', () => {
    const weeks = heatmapWeeks(TODAY);
    for (const week of weeks) {
      const monday = new Date(`${week[0]}T00:00:00`);
      expect(monday.getDay()).toBe(1);
    }
  });

  it('가장 오래된 주가 처음, 오늘이 속한 주가 마지막이다', () => {
    const weeks = heatmapWeeks(TODAY);
    const lastWeek = weeks.at(-1);
    expect(lastWeek).toContain(TODAY);
    expect(weeks[0]?.[0]).toBe('2026-06-29');
  });

  it('(문서화) 월요일 시작 주 단위라 today<=필터 후 실제 날 수가 요일마다 78~84일로 흔들린다', () => {
    // 이 진동 자체가 review 라운드2 m19 의 원인이다 — 스트릭은 이 함수가 아니라
    // `streakWindowRange`(아래)로 계산한다.
    const sunday: DateKey = '2026-09-20';
    const monday: DateKey = '2026-09-21';
    const sundayCount = heatmapWeeks(sunday)
      .flat()
      .filter((d) => d <= sunday).length;
    const mondayCount = heatmapWeeks(monday)
      .flat()
      .filter((d) => d <= monday).length;
    expect(sundayCount).toBe(84);
    expect(mondayCount).toBe(78);
  });
});

describe('streakWindowRange (review 라운드2 m19)', () => {
  it('요일과 무관하게 항상 고정 길이(84일)다', () => {
    const sunday: DateKey = '2026-09-20';
    const monday: DateKey = '2026-09-21';
    const sundayRange = streakWindowRange(sunday);
    const mondayRange = streakWindowRange(monday);
    expect(datesInRange(sundayRange.from, sundayRange.to)).toHaveLength(STREAK_WINDOW_DAYS);
    expect(datesInRange(mondayRange.from, mondayRange.to)).toHaveLength(STREAK_WINDOW_DAYS);
  });

  it('today 로 끝난다(양끝 포함)', () => {
    const range = streakWindowRange(TODAY);
    expect(range.to).toBe(TODAY);
  });
});

describe('mergeRanges', () => {
  it('두 범위를 함께 덮는 가장 작은 범위를 낸다', () => {
    expect(
      mergeRanges(
        { from: '2026-01-01' as DateKey, to: '2026-01-10' as DateKey },
        { from: '2026-01-05' as DateKey, to: '2026-01-20' as DateKey },
      ),
    ).toEqual({ from: '2026-01-01', to: '2026-01-20' });
  });
});

describe('heatmapDataRange·shouldSplitTodoFetch (review M2)', () => {
  const heatmapRange = heatmapDataRange(heatmapWeeks(TODAY)); // 2026-06-29 ~ 2026-09-20

  it('heatmapDataRange 는 히트맵 격자 전체의 최소~최대다', () => {
    expect(heatmapRange).toEqual({ from: '2026-06-29', to: TODAY });
  });

  it('프리셋 경로(기간이 today 로 끝남)는 항상 히트맵과 겹쳐 나누지 않는다', () => {
    expect(shouldSplitTodoFetch(presetRange('last7', TODAY), heatmapRange)).toBe(false);
    expect(shouldSplitTodoFetch(presetRange('thisYear', TODAY), heatmapRange)).toBe(false);
  });

  it('맞닿아 있으면(하루도 안 비면) 나누지 않는다', () => {
    // heatmapRange.from 바로 전날까지
    const touching = { from: '2026-06-01' as DateKey, to: '2026-06-28' as DateKey };
    expect(shouldSplitTodoFetch(touching, heatmapRange)).toBe(false);
  });

  it('멀리 떨어진 custom 범위는 나눈다(실측 재현: 2015년 선택)', () => {
    const farPast = { from: '2015-01-01' as DateKey, to: '2015-12-31' as DateKey };
    expect(shouldSplitTodoFetch(farPast, heatmapRange)).toBe(true);
  });

  it('union 은 여전히 겹치는 경우의 실제 필요 범위와 같다(회귀: 나누지 않는 경로는 그대로)', () => {
    const period = presetRange('last7', TODAY);
    expect(unionFetchRange(period, heatmapWeeks(TODAY))).toEqual({
      from: heatmapRange.from,
      to: TODAY,
    });
  });
});
