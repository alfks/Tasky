import { describe, expect, it } from 'vitest';

import { addCivilDays, dayOfMonthOf, dayOfWeekOf, isValidDateKey } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';

// 테스트 계층은 Date 를 쓸 수 있다(도메인 결정성 규칙은 비테스트 파일 기준 — code-style §7).
// "Date 없이 만든 계산기"가 Date 와 같은 답을 내는지 직접 대조한다.
const SAMPLES: DateKey[] = [
  '1970-01-01',
  '1999-12-31',
  '2000-02-29', // 400 으로 나누어지는 윤년
  '2024-02-29',
  '2026-01-15',
  '2026-09-15',
  '2100-03-01', // 100 으로 나누어지지만 윤년이 아닌 해의 다음 날
  '1969-07-20', // epoch 이전(음수 일수)
];

describe('isValidDateKey', () => {
  it('형식이 맞고 실존하는 날짜는 통과한다', () => {
    for (const sample of SAMPLES) {
      expect(isValidDateKey(sample)).toBe(true);
    }
  });

  it('형식은 맞아도 실존하지 않는 날짜는 거부한다', () => {
    expect(isValidDateKey('2026-02-30')).toBe(false);
    expect(isValidDateKey('2026-13-01')).toBe(false);
    expect(isValidDateKey('2025-02-29')).toBe(false);
  });

  it('형식 자체가 다르면 거부한다', () => {
    expect(isValidDateKey('2026/01/15')).toBe(false);
    expect(isValidDateKey('2026-1-15')).toBe(false);
    expect(isValidDateKey(20_260_115)).toBe(false);
  });
});

describe('dayOfWeekOf', () => {
  it('Date#getDay() 과 같은 값(0=일~6=토)을 낸다', () => {
    for (const sample of SAMPLES) {
      const [y, m, d] = sample.split('-').map(Number);
      expect(dayOfWeekOf(sample)).toBe(new Date(y, m - 1, d).getDay());
    }
  });
});

describe('dayOfMonthOf', () => {
  it('그 날짜의 일(day)을 그대로 돌려준다', () => {
    expect(dayOfMonthOf('2026-01-15')).toBe(15);
    expect(dayOfMonthOf('2026-01-01')).toBe(1);
    expect(dayOfMonthOf('2026-01-31')).toBe(31);
  });
});

describe('addCivilDays', () => {
  it('월·연 경계를 넘는다', () => {
    expect(addCivilDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(addCivilDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('윤년 2/29 을 올바르게 지난다', () => {
    expect(addCivilDays('2024-02-28', 1)).toBe('2024-02-29');
    expect(addCivilDays('2024-02-29', 1)).toBe('2024-03-01');
    expect(addCivilDays('2025-02-28', 1)).toBe('2025-03-01');
  });

  it('음수 days 는 그만큼 전으로 간다', () => {
    expect(addCivilDays('2026-01-01', -1)).toBe('2025-12-31');
  });

  it('정수가 아닌 days 는 RangeError', () => {
    expect(() => addCivilDays('2026-01-01', 1.5)).toThrow(RangeError);
  });

  it('Date#setDate() 와 같은 결과를 낸다(왕복 대조)', () => {
    for (const sample of SAMPLES) {
      for (const delta of [-400, -1, 0, 1, 30, 365]) {
        const [y, m, d] = sample.split('-').map(Number);
        const expected = new Date(y, m - 1, d);
        expected.setDate(expected.getDate() + delta);
        const pad = (n: number): string => String(n).padStart(2, '0');
        const want = `${expected.getFullYear()}-${pad(expected.getMonth() + 1)}-${pad(expected.getDate())}`;
        expect(addCivilDays(sample, delta)).toBe(want);
      }
    }
  });
});
