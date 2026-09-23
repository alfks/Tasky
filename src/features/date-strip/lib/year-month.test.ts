import { describe, expect, it } from 'vitest';

// `daysInMonth` 는 `year-month.ts` 가 재수출하지 않는다(리뷰 Nit — 프로덕션 사용처가 없는
// 재수출이었다) — 단일 소스인 `month.ts` 에서 바로 가져온다.
import { daysInMonth } from '@/features/date-strip/lib/month';
import {
  MAX_YEAR,
  MIN_YEAR,
  monthLabel,
  moveMonthFocus,
  shiftYear,
  withYearMonth,
  yearMonthOf,
} from '@/features/date-strip/lib/year-month';

describe('yearMonthOf. date 에서 년·월을 뽑는다', () => {
  it('YYYY-MM-DD 를 년·월로 나눈다', () => {
    expect(yearMonthOf('2026-09-17')).toEqual({ year: 2026, month: 9 });
  });
});

describe('monthLabel. 월 이름은 M월 형식이다', () => {
  it.each([
    [1, '1월'],
    [9, '9월'],
    [12, '12월'],
  ])('%i → %s', (month, label) => {
    expect(monthLabel(month)).toBe(label);
  });
});

describe('daysInMonth. 그 해·달의 마지막 날짜를 낸다', () => {
  it('윤년의 2월은 29일이다', () => {
    expect(daysInMonth(2024, 2)).toBe(29);
  });

  it('평년의 2월은 28일이다', () => {
    expect(daysInMonth(2023, 2)).toBe(28);
  });

  it('31일까지 있는 달은 31이다', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
  });

  it('12월은 그 해 마지막 달이다(해를 넘기지 않는다)', () => {
    expect(daysInMonth(2026, 12)).toBe(31);
  });
});

describe('withYearMonth. 일(日)을 유지한 채 이동한다(R15)', () => {
  it('목적지 달에도 같은 날이 있으면 그대로 유지한다', () => {
    expect(withYearMonth('2026-09-17', { year: 2027, month: 3 })).toBe('2027-03-17');
  });

  it('말일 자르기 — 1월 31일에서 일수가 적은 2월로 가면 그 달의 마지막 날로 자른다', () => {
    expect(withYearMonth('2026-01-31', { year: 2026, month: 2 })).toBe('2026-02-28');
  });

  it('말일 자르기 — 윤년 2월에서는 29일까지 유지한다', () => {
    expect(withYearMonth('2023-01-31', { year: 2024, month: 2 })).toBe('2024-02-29');
  });

  it('달을 건너뛰지 않는다 — 자른 뒤에도 목적지 달 안에 머문다', () => {
    const result = withYearMonth('2026-03-31', { year: 2026, month: 4 });
    expect(result).toBe('2026-04-30');
  });
});

describe('shiftYear. 해만 옮기고 월은 그대로 두며 범위(1970~2099) 밖으로 나가지 않는다(R15·R16)', () => {
  it('해를 하나 올린다', () => {
    expect(shiftYear({ year: 2026, month: 9 }, 1)).toEqual({ year: 2027, month: 9 });
  });

  it('해를 하나 내린다', () => {
    expect(shiftYear({ year: 2026, month: 9 }, -1)).toEqual({ year: 2025, month: 9 });
  });

  it(`최솟값(${MIN_YEAR}) 아래로 내려가지 않는다`, () => {
    expect(shiftYear({ year: MIN_YEAR, month: 5 }, -1)).toEqual({ year: MIN_YEAR, month: 5 });
  });

  it(`최댓값(${MAX_YEAR}) 위로 올라가지 않는다`, () => {
    expect(shiftYear({ year: MAX_YEAR, month: 5 }, 1)).toEqual({ year: MAX_YEAR, month: 5 });
  });
});

describe('moveMonthFocus. R16 의 월 격자 roving 이동', () => {
  it('left/right 는 ±1달이고 해 경계를 넘으면 해도 함께 옮긴다', () => {
    expect(moveMonthFocus({ year: 2026, month: 9 }, 'left')).toEqual({ year: 2026, month: 8 });
    expect(moveMonthFocus({ year: 2026, month: 1 }, 'left')).toEqual({ year: 2025, month: 12 });
    expect(moveMonthFocus({ year: 2026, month: 12 }, 'right')).toEqual({ year: 2027, month: 1 });
  });

  it('up/down 은 ±3달이다', () => {
    expect(moveMonthFocus({ year: 2026, month: 9 }, 'up')).toEqual({ year: 2026, month: 6 });
    expect(moveMonthFocus({ year: 2026, month: 9 }, 'down')).toEqual({ year: 2026, month: 12 });
  });

  it('home/end 는 그 해 1월/12월이다', () => {
    expect(moveMonthFocus({ year: 2026, month: 9 }, 'home')).toEqual({ year: 2026, month: 1 });
    expect(moveMonthFocus({ year: 2026, month: 9 }, 'end')).toEqual({ year: 2026, month: 12 });
  });

  it('pageUp/pageDown 은 ±1년이고 월을 유지한다', () => {
    expect(moveMonthFocus({ year: 2026, month: 9 }, 'pageUp')).toEqual({ year: 2025, month: 9 });
    expect(moveMonthFocus({ year: 2026, month: 9 }, 'pageDown')).toEqual({ year: 2027, month: 9 });
  });

  it('범위 끝(2099년 12월)에서 right 는 뒤로 튀지 않고 그대로 멈춘다', () => {
    // 해만 클램프하면 "2100년 1월" → "2099년 1월" 로 뒤로 튀는 사고가 난다(shiftMonth 주석 참고).
    expect(moveMonthFocus({ year: MAX_YEAR, month: 12 }, 'right')).toEqual({
      year: MAX_YEAR,
      month: 12,
    });
  });

  it('범위 끝(1970년 1월)에서 left 는 그대로 멈춘다', () => {
    expect(moveMonthFocus({ year: MIN_YEAR, month: 1 }, 'left')).toEqual({
      year: MIN_YEAR,
      month: 1,
    });
  });
});
