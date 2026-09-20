import { describe, expect, it } from 'vitest';

import {
  CUSTOM_RANGE_MAX_DAYS,
  HEATMAP_WEEKS,
  daysBetween,
  datesInRange,
  heatmapWeeks,
  isValidCustomRange,
  presetRange,
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
});
