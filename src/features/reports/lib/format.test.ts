import { describe, expect, it } from 'vitest';

import { formatFocusDuration, formatHeatmapDate } from '@/features/reports/lib/format';

describe('formatFocusDuration', () => {
  it('0초는 "1분 미만"이다', () => {
    expect(formatFocusDuration(0)).toBe('1분 미만');
  });

  it('59초는 "1분 미만"이다', () => {
    expect(formatFocusDuration(59)).toBe('1분 미만');
  });

  it('60초는 "1분"이다', () => {
    expect(formatFocusDuration(60)).toBe('1분');
  });

  it('3시간 20분(12000초)', () => {
    expect(formatFocusDuration(3 * 3600 + 20 * 60)).toBe('3시간 20분');
  });

  it('정확히 2시간이면 분을 생략한다', () => {
    expect(formatFocusDuration(2 * 3600)).toBe('2시간');
  });
});

describe('formatHeatmapDate (review n2 — 연도 포함)', () => {
  it('0을 채운 연·월·일을 자연어로 바꾼다', () => {
    expect(formatHeatmapDate('2026-09-05')).toBe('2026년 9월 5일');
  });
});
