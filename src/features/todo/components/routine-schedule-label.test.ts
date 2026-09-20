// routine-schedule-label 포매팅 테스트 (routine.md §2·§5).
import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import {
  recurrenceSummary,
  routineScheduleLabel,
  routineStatusLabel,
} from '@/features/todo/components/routine-schedule-label';
import { makeRoutine } from '@/test/fixtures/routine';

describe('recurrenceSummary', () => {
  it('매주 반복은 저장된 순서대로 요일을 이어 붙인다', () => {
    expect(recurrenceSummary({ type: 'weekly', daysOfWeek: [5, 6] })).toBe('매주 금·토');
  });

  it('매달 반복은 쉼표로 이어 붙인다', () => {
    expect(recurrenceSummary({ type: 'monthly', daysOfMonth: [1, 15] })).toBe('매달 1, 15일');
  });
});

describe('routineStatusLabel (R7·R7-a)', () => {
  it('무기한·활성 루틴은 "계속"', () => {
    expect(routineStatusLabel(makeRoutine({ active: true }))).toBe('계속');
  });

  it('무기한·중지 루틴은 "중지됨"', () => {
    expect(routineStatusLabel(makeRoutine({ active: false }))).toBe('중지됨');
  });

  it('종료일이 있는 루틴은 그 날짜를 "~M/D" 로 보여준다(active 값과 무관)', () => {
    const routine = makeRoutine({ active: false, endDate: '2026-10-04' as DateKey });
    expect(routineStatusLabel(routine)).toBe('~10/4');
  });
});

describe('routineScheduleLabel', () => {
  it('반복 요약과 상태를 가운뎃점으로 잇는다', () => {
    const routine = makeRoutine({
      recurrence: { type: 'weekly', daysOfWeek: [2, 4] },
      endDate: '2026-10-04' as DateKey,
    });
    expect(routineScheduleLabel(routine)).toBe('매주 화·목 · ~10/4');
  });
});
