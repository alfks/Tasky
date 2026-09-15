import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import {
  addDays,
  fromDateKey,
  isDateKey,
  nowIso,
  startOfWeek,
  toDateKey,
  todayKey,
  type DateKey,
} from '@/lib/date';

// 기본 TZ 는 America/New_York(UTC-5, DST 있음). toDateKey 자정 경계 테스트만 각자 TZ 를 바꿨다가 되돌린다.
const ORIGINAL_TZ = process.env.TZ;
beforeAll(() => {
  process.env.TZ = 'America/New_York';
});
afterAll(() => {
  process.env.TZ = ORIGINAL_TZ;
});

describe('toDateKey', () => {
  it('로컬 연-월-일을 0 채움된 DateKey 로 바꾼다', () => {
    expect(toDateKey(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  // getUTC* 오용 회귀는 음수 오프셋에서 "다음날", 양수 오프셋에서 "전날"로 반대 방향으로 나타난다.
  // 주 사용 시간대(+9)를 포함해 양 극단(+14 / -5)까지 자정 경계를 돈다.
  it.each(['America/New_York', 'Asia/Seoul', 'Pacific/Kiritimati'])(
    '%s: 자정 경계에서 로컬 날짜가 밀리지 않는다',
    (tz) => {
      const saved = process.env.TZ;
      process.env.TZ = tz;
      try {
        expect(toDateKey(new Date(2026, 0, 1, 23, 59, 59, 999))).toBe('2026-01-01');
        expect(toDateKey(new Date(2026, 0, 2, 0, 0, 0, 0))).toBe('2026-01-02');
      } finally {
        process.env.TZ = saved;
      }
    },
  );
});

describe('fromDateKey', () => {
  it('DateKey 가 가리키는 로컬 자정 Date 를 돌려주고 toDateKey 와 왕복한다', () => {
    const date = fromDateKey('2026-03-10' as DateKey);
    expect([date.getFullYear(), date.getMonth(), date.getDate()]).toEqual([2026, 2, 10]);
    expect([date.getHours(), date.getMinutes(), date.getSeconds()]).toEqual([0, 0, 0]);
    expect(toDateKey(fromDateKey('2026-07-04' as DateKey))).toBe('2026-07-04');
  });

  it('실존하지 않거나 형식이 다른 입력을 조용히 정규화하지 않고 RangeError 를 던진다', () => {
    expect(() => fromDateKey('2026-02-30' as DateKey)).toThrow(RangeError); // 형식은 맞지만 실존 안 함
    expect(() => fromDateKey('' as DateKey)).toThrow(RangeError); // 형식 자체가 다름
  });
});

describe('isDateKey', () => {
  it.each([
    ['2026-09-15', true],
    ['2028-02-29', true], // 윤년
    ['2026-02-29', false], // 평년엔 2월 29일이 없다
    ['2026-02-30', false], // 2월엔 30일이 없다
    ['2026-13-01', false], // 13월은 없다
    ['2026-00-01', false], // 0월은 없다
    ['2026-01-32', false], // 1월 32일은 없다
    ['2026-01-00', false], // 0일은 없다
    ['', false],
    ['abc', false],
    ['2026-1-5', false], // 0 채움이 아니다
    ['2026-01-05T00:00:00Z', false], // 형식이 다르다
    ['0099-01-01', false], // 두 자리 연도 함정(Date 가 1999로 재해석) — 왕복 대조로 거부된다
  ] as const)('%s → %s', (value, expected) => {
    expect(isDateKey(value)).toBe(expected);
  });

  it('문자열이 아닌 값은 전부 거부한다', () => {
    expect([null, undefined, 20260915, {}].map(isDateKey)).toEqual([false, false, false, false]);
  });
});

describe('addDays', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-01-01', -1, '2025-12-31'],
    ['2028-02-28', 1, '2028-02-29'], // 윤년
    ['2028-02-29', 1, '2028-03-01'],
    ['2027-02-28', 1, '2027-03-01'], // 평년은 28일에서 바로 3월로
    ['2026-06-15', 0, '2026-06-15'],
    ['2026-09-17', 7, '2026-09-24'], // 목 → 목, 요일 유지
    ['2026-09-17', -7, '2026-09-10'],
    ['2026-03-07', 1, '2026-03-08'], // DST 시작(미국 2026-03-08)
    ['2026-03-08', 1, '2026-03-09'],
    ['2026-10-31', 1, '2026-11-01'], // DST 종료(미국 2026-11-01)
    ['2026-11-01', 1, '2026-11-02'],
  ] as const)('%s + %i일 = %s', (key, days, expected) => {
    expect(addDays(key as DateKey, days)).toBe(expected);
  });

  it('정수가 아닌 days(소수·NaN)는 RangeError 를 던진다', () => {
    expect(() => addDays('2026-06-15' as DateKey, 0.5)).toThrow(RangeError);
    expect(() => addDays('2026-06-15' as DateKey, Number.NaN)).toThrow(RangeError);
  });
});

describe('startOfWeek', () => {
  it.each([
    ['2026-09-14', '2026-09-14'], // 월요일이면 자신
    ['2026-09-20', '2026-09-14'], // 일 → 월 경계
    ['2026-09-19', '2026-09-14'], // 토요일
    ['2026-10-01', '2026-09-28'], // 월 경계(목요일)
    ['2026-01-01', '2025-12-29'], // 연 경계(목요일)
  ] as const)('%s 가 속한 주의 월요일은 %s', (key, monday) => {
    expect(startOfWeek(key as DateKey)).toBe(monday);
  });
});

describe('nowIso', () => {
  it('toISOString 형식(밀리초·Z)이며 과거로 가지 않는다', () => {
    const a = nowIso();
    expect(a).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    expect(new Date(nowIso()).getTime()).toBeGreaterThanOrEqual(new Date(a).getTime());
  });

  it('vi.setSystemTime 로 고정된 시각을 그대로 돌려준다(후속 티켓의 시간 고정 계약)', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-15T08:59:00.000Z'));
      expect(nowIso()).toBe('2026-09-15T08:59:00.000Z');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('todayKey', () => {
  it('vi.setSystemTime 로 고정되며, 자정을 넘기면 갱신된다(date-strip.md R12 전제)', () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date(2026, 8, 15, 23, 59, 59, 999));
      expect(todayKey()).toBe('2026-09-15');
      vi.setSystemTime(new Date(2026, 8, 16, 0, 0, 0, 0));
      expect(todayKey()).toBe('2026-09-16');
    } finally {
      vi.useRealTimers();
    }
  });
});
