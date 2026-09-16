import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import {
  DAYS_IN_WEEK,
  MAX_DATE_KEY,
  MIN_DATE_KEY,
  clampToRange,
  isWithinRange,
  shiftWithinRange,
  weekDays,
} from '@/features/date-strip/lib/week';

/** 각 칸이 하루씩 이어지는지 — 주가 무엇을 걸치든 이 성질은 깨지지 않아야 한다. */
function isConsecutive(days: DateKey[]): boolean {
  return days.every((day, index) => index === 0 || day > days[index - 1]);
}

describe('R1. 스트립은 선택 날짜가 속한 월요일 시작 7일을 보여준다', () => {
  it('주 중간(목요일)을 고르면 그 주 월요일부터 7일이다', () => {
    expect(weekDays('2026-09-17')).toEqual([
      '2026-09-14',
      '2026-09-15',
      '2026-09-16',
      '2026-09-17',
      '2026-09-18',
      '2026-09-19',
      '2026-09-20',
    ]);
  });

  it('일요일을 고르면 그 주의 마지막 칸이다(주는 일요일이 아니라 월요일에 시작한다)', () => {
    const days = weekDays('2026-09-06');
    expect(days[0]).toBe('2026-08-31');
    expect(days[DAYS_IN_WEEK - 1]).toBe('2026-09-06');
  });

  it('월요일을 고르면 그 날이 첫 칸이다', () => {
    expect(weekDays('2026-09-14')[0]).toBe('2026-09-14');
  });

  it('주가 월을 걸치면 9월과 10월 칸이 한 주에 함께 있다', () => {
    const days = weekDays('2026-09-30');
    expect(days).toEqual([
      '2026-09-28',
      '2026-09-29',
      '2026-09-30',
      '2026-10-01',
      '2026-10-02',
      '2026-10-03',
      '2026-10-04',
    ]);
    expect(isConsecutive(days)).toBe(true);
  });

  it('주가 해를 걸치면 2025년과 2026년 칸이 한 주에 함께 있다', () => {
    const days = weekDays('2026-01-01');
    expect(days[0]).toBe('2025-12-29');
    expect(days[3]).toBe('2026-01-01');
    expect(days[DAYS_IN_WEEK - 1]).toBe('2026-01-04');
  });

  it('윤년 2월 29일이 있는 주도 7칸이고 2월 29일을 포함한다', () => {
    const days = weekDays('2028-02-29');
    expect(days[0]).toBe('2028-02-28');
    expect(days).toContain('2028-02-29');
    expect(days).toHaveLength(DAYS_IN_WEEK);
    expect(weekDays('2024-02-29')[0]).toBe('2024-02-26');
  });

  it('평년 2월 마지막 주는 2월 29일 없이 3월로 이어진다', () => {
    const days = weekDays('2026-02-26');
    expect(days).not.toContain('2026-02-29');
    expect(days[DAYS_IN_WEEK - 1]).toBe('2026-03-01');
  });

  it('DST 전환일(자정이 없는 지역)에도 7칸이 하루씩 이어진다', () => {
    // 2026-09-06 아메리카/산티아고는 00:00 이 01:00 으로 건너뛴다 — 로컬 자정이 존재하지 않는 날이다.
    const original = process.env.TZ;
    try {
      process.env.TZ = 'America/Santiago';
      const days = weekDays('2026-09-06');
      expect(days).toEqual([
        '2026-08-31',
        '2026-09-01',
        '2026-09-02',
        '2026-09-03',
        '2026-09-04',
        '2026-09-05',
        '2026-09-06',
      ]);
      expect(isConsecutive(days)).toBe(true);
    } finally {
      process.env.TZ = original;
    }
  });

  it('UTC+13 지역(날짜선 근처)에서도 같은 주를 만든다', () => {
    const original = process.env.TZ;
    try {
      process.env.TZ = 'Pacific/Apia';
      expect(weekDays('2026-09-17')[0]).toBe('2026-09-14');
    } finally {
      process.env.TZ = original;
    }
  });
});

describe('R6. 이동 가능 범위는 1970-01-01 ~ 2099-12-31 이다', () => {
  it('양끝은 범위 안이고 그 바깥은 범위 밖이다', () => {
    expect(isWithinRange(MIN_DATE_KEY)).toBe(true);
    expect(isWithinRange(MAX_DATE_KEY)).toBe(true);
    expect(isWithinRange('1969-12-31')).toBe(false);
    expect(isWithinRange('2100-01-01')).toBe(false);
  });

  it('범위 밖으로 가는 이동은 undefined 를 돌려준다(버튼 비활성의 근거)', () => {
    expect(shiftWithinRange(MIN_DATE_KEY, -1)).toBeUndefined();
    expect(shiftWithinRange(MAX_DATE_KEY, 1)).toBeUndefined();
    expect(shiftWithinRange(MIN_DATE_KEY, 7)).toBe('1970-01-08');
    expect(shiftWithinRange(MAX_DATE_KEY, -7)).toBe('2099-12-24');
  });

  it('범위 밖 날짜는 양끝으로 당겨진다', () => {
    expect(clampToRange('1900-05-05')).toBe(MIN_DATE_KEY);
    expect(clampToRange('2200-05-05')).toBe(MAX_DATE_KEY);
    expect(clampToRange('2026-09-17')).toBe('2026-09-17');
  });

  it('범위 끝을 걸친 주도 7칸을 유지하고 밖의 칸만 범위 밖으로 표시된다', () => {
    const first = weekDays(MIN_DATE_KEY);
    expect(first).toHaveLength(DAYS_IN_WEEK);
    expect(first[0]).toBe('1969-12-29');
    expect(first.filter((day) => !isWithinRange(day))).toEqual([
      '1969-12-29',
      '1969-12-30',
      '1969-12-31',
    ]);

    const last = weekDays(MAX_DATE_KEY);
    expect(last).toHaveLength(DAYS_IN_WEEK);
    expect(last[0]).toBe('2099-12-28');
    expect(last.filter((day) => !isWithinRange(day))).toEqual([
      '2100-01-01',
      '2100-01-02',
      '2100-01-03',
    ]);
  });
});
