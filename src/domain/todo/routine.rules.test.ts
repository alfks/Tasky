import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import { DomainError } from '@/domain/errors';
import { expandRoutineDates } from '@/domain/todo/routine.rules';

describe('expandRoutineDates', () => {
  it('매주 반복: 시작~종료 안에서 그 요일에 해당하는 날짜만 오름차순으로 돌려준다', () => {
    // 2026-01-15 은 목요일(요일 4).
    const dates = expandRoutineDates({
      startDate: '2026-01-15' as DateKey,
      endDate: '2026-01-29' as DateKey,
      recurrence: { type: 'weekly', daysOfWeek: [4] },
    });
    expect(dates).toEqual(['2026-01-15', '2026-01-22', '2026-01-29']);
  });

  it('매주 반복: 요일을 여러 개 고르면 전부 낀다', () => {
    // 2026-01-15(목) ~ 2026-01-18(일): 목·금·토·일.
    const dates = expandRoutineDates({
      startDate: '2026-01-15' as DateKey,
      endDate: '2026-01-18' as DateKey,
      recurrence: { type: 'weekly', daysOfWeek: [0, 6] }, // 일·토
    });
    expect(dates).toEqual(['2026-01-17', '2026-01-18']);
  });

  it('매달 반복: 그 달에 없는 날(31일 등)은 그 달만 건너뛴다', () => {
    const dates = expandRoutineDates({
      startDate: '2026-01-31' as DateKey,
      endDate: '2026-03-31' as DateKey,
      recurrence: { type: 'monthly', daysOfMonth: [31] },
    });
    // 2월은 31일이 없어 건너뛴다.
    expect(dates).toEqual(['2026-01-31', '2026-03-31']);
  });

  it('매달 반복: 시작일 자체가 조건에 안 맞으면 다음 달부터 낀다', () => {
    const dates = expandRoutineDates({
      startDate: '2026-01-15' as DateKey,
      endDate: '2026-03-01' as DateKey,
      recurrence: { type: 'monthly', daysOfMonth: [1] },
    });
    expect(dates).toEqual(['2026-02-01', '2026-03-01']);
  });

  it('맞는 날짜가 하나도 없으면 빈 배열이다(오류가 아니다)', () => {
    const dates = expandRoutineDates({
      startDate: '2026-01-15' as DateKey,
      endDate: '2026-01-16' as DateKey,
      recurrence: { type: 'monthly', daysOfMonth: [1] },
    });
    expect(dates).toEqual([]);
  });

  it('종료일이 시작일보다 이르면 ROUTINE_DATE_RANGE_INVALID', () => {
    expect(() =>
      expandRoutineDates({
        startDate: '2026-01-15' as DateKey,
        endDate: '2026-01-14' as DateKey,
        recurrence: { type: 'weekly', daysOfWeek: [4] },
      }),
    ).toThrow(DomainError);
  });

  it('실존하지 않는 날짜는 ROUTINE_DATE_RANGE_INVALID', () => {
    expect(() =>
      expandRoutineDates({
        startDate: '2026-02-30' as DateKey,
        endDate: '2026-03-01' as DateKey,
        recurrence: { type: 'weekly', daysOfWeek: [4] },
      }),
    ).toThrow(DomainError);
  });

  it('반복 요일·날짜가 비어 있으면 ROUTINE_RECURRENCE_INVALID', () => {
    expect(() =>
      expandRoutineDates({
        startDate: '2026-01-15' as DateKey,
        endDate: '2026-01-16' as DateKey,
        recurrence: { type: 'weekly', daysOfWeek: [] },
      }),
    ).toThrow(DomainError);
  });

  it('요일·날짜 값이 범위를 벗어나면 ROUTINE_RECURRENCE_INVALID', () => {
    expect(() =>
      expandRoutineDates({
        startDate: '2026-01-15' as DateKey,
        endDate: '2026-01-16' as DateKey,
        recurrence: { type: 'weekly', daysOfWeek: [7] },
      }),
    ).toThrow(DomainError);
    expect(() =>
      expandRoutineDates({
        startDate: '2026-01-15' as DateKey,
        endDate: '2026-01-16' as DateKey,
        recurrence: { type: 'monthly', daysOfMonth: [32] },
      }),
    ).toThrow(DomainError);
  });

  it('기간이 366일이면(경계값) 통과한다', () => {
    // 2026-01-01 ~ 2027-01-01 은 시작·종료를 포함해 정확히 366일이다.
    const dates = expandRoutineDates({
      startDate: '2026-01-01' as DateKey,
      endDate: '2027-01-01' as DateKey,
      recurrence: { type: 'monthly', daysOfMonth: [1] },
    });
    expect(dates.length).toBeGreaterThan(0);
  });

  it('기간이 366일을 넘으면(367일) ROUTINE_RANGE_TOO_LONG', () => {
    expect(() =>
      expandRoutineDates({
        startDate: '2026-01-01' as DateKey,
        endDate: '2027-01-02' as DateKey,
        recurrence: { type: 'monthly', daysOfMonth: [1] },
      }),
    ).toThrow(DomainError);
  });
});
