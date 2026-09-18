import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import {
  chunkIntoWeeks,
  endOfMonth,
  isSameMonth,
  monthGridDays,
  shiftMonthWithinRange,
  startOfMonth,
} from '@/features/date-strip/lib/month';
import { DAYS_IN_WEEK } from '@/features/date-strip/lib/week';

/** 2026-09-17(목). 그 달은 화요일에 시작해 수요일에 끝나므로 격자가 앞뒤로 삐져나온다. */
const SEPTEMBER: DateKey = '2026-09-17';

describe('R15. 월 격자는 1일이 속한 주의 월요일부터 말일이 속한 주의 일요일까지다', () => {
  it('2026년 9월(화요일 시작, 수요일 끝)은 8/31 ~ 10/4 다', () => {
    const days = monthGridDays(SEPTEMBER);
    expect(days[0]).toBe('2026-08-31');
    expect(days[days.length - 1]).toBe('2026-10-04');
  });

  it('칸은 항상 7의 배수이고 하루도 건너뛰지 않는다', () => {
    for (const date of ['2026-01-10', '2026-02-10', '2026-09-17', '2027-08-01'] as DateKey[]) {
      const days = monthGridDays(date);
      expect(days.length % DAYS_IN_WEEK).toBe(0);
      expect(new Set(days).size).toBe(days.length);
      // 연속 범위라야 요약을 한 번의 범위 조회로 읽을 수 있다 (R17).
      expect(days).toEqual([...days].sort());
    }
  });

  it('토요일에 시작하는 31일 달(2026년 8월)은 6줄 42칸이 된다', () => {
    expect(monthGridDays('2026-08-15' as DateKey)).toHaveLength(6 * DAYS_IN_WEEK);
  });

  it('월요일에 시작하는 28일 달(2021년 2월)은 4줄 28칸이 된다', () => {
    expect(monthGridDays('2021-02-10' as DateKey)).toHaveLength(4 * DAYS_IN_WEEK);
  });

  it('그 달의 날짜를 하나도 빠뜨리지 않는다', () => {
    const days = monthGridDays(SEPTEMBER);
    for (let day = 1; day <= 30; day += 1) {
      expect(days).toContain(`2026-09-${String(day).padStart(2, '0')}`);
    }
  });
});

describe('R15. 격자는 7칸짜리 줄로 잘린다', () => {
  it('줄마다 7칸이고 이어 붙이면 원래 배열이다', () => {
    const days = monthGridDays(SEPTEMBER);
    const rows = chunkIntoWeeks(days);
    expect(rows.every((row) => row.length === DAYS_IN_WEEK)).toBe(true);
    expect(rows.flat()).toEqual(days);
  });
});

describe('R14. ‹ › 는 월 보기에서 한 달을 옮긴다', () => {
  it('다음 달·이전 달로 같은 일(day)을 유지한다', () => {
    expect(shiftMonthWithinRange('2026-09-17' as DateKey, 1)).toBe('2026-10-17');
    expect(shiftMonthWithinRange('2026-09-17' as DateKey, -1)).toBe('2026-08-17');
  });

  it('연 경계를 넘는다', () => {
    expect(shiftMonthWithinRange('2026-12-31' as DateKey, 1)).toBe('2027-01-31');
    expect(shiftMonthWithinRange('2026-01-15' as DateKey, -1)).toBe('2025-12-15');
  });

  it('목적지 달에 없는 날은 그 달의 마지막 날로 자른다 — 2월을 건너뛰지 않는다', () => {
    expect(shiftMonthWithinRange('2026-01-31' as DateKey, 1)).toBe('2026-02-28');
    expect(shiftMonthWithinRange('2028-01-31' as DateKey, 1)).toBe('2028-02-29');
    expect(shiftMonthWithinRange('2026-03-31' as DateKey, -1)).toBe('2026-02-28');
  });

  it('R6. 이동 가능 범위 밖이면 undefined 라 버튼이 비활성된다', () => {
    expect(shiftMonthWithinRange('1970-01-15' as DateKey, -1)).toBeUndefined();
    expect(shiftMonthWithinRange('2099-12-15' as DateKey, 1)).toBeUndefined();
    expect(shiftMonthWithinRange('1970-02-15' as DateKey, -1)).toBe('1970-01-15');
  });
});

describe('R15·R16. 달의 양끝', () => {
  it('startOfMonth·endOfMonth 는 그 달의 첫날과 마지막 날이다(윤년 포함)', () => {
    expect(startOfMonth(SEPTEMBER)).toBe('2026-09-01');
    expect(endOfMonth(SEPTEMBER)).toBe('2026-09-30');
    expect(endOfMonth('2026-02-10' as DateKey)).toBe('2026-02-28');
    expect(endOfMonth('2028-02-10' as DateKey)).toBe('2028-02-29');
  });

  it('isSameMonth 는 연도까지 본다', () => {
    expect(isSameMonth('2026-09-01' as DateKey, '2026-09-30' as DateKey)).toBe(true);
    expect(isSameMonth('2026-09-30' as DateKey, '2026-10-01' as DateKey)).toBe(false);
    expect(isSameMonth('2026-09-01' as DateKey, '2027-09-01' as DateKey)).toBe(false);
  });
});
