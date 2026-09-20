import { describe, expect, it } from 'vitest';

import { computeStreak } from '@/domain/todo/streak';

/** 테스트용 축약 — `DaySummary` 의 `total`·`isAllDone` 만 있으면 된다. */
function day(total: number, isAllDone: boolean) {
  return { total, isAllDone };
}

describe('computeStreak (stats.md R4, 시그니처 정정: total 포함 배열)', () => {
  it('빈 배열이면 0이다', () => {
    expect(computeStreak([])).toBe(0);
  });

  it('전부 완료면 배열 길이만큼이다', () => {
    expect(computeStreak([day(3, true), day(2, true), day(1, true)])).toBe(3);
  });

  it('어제 100% + 오늘 미완료(투두 있음) → 스트릭 0 (완료 조건 경계)', () => {
    expect(computeStreak([day(3, true), day(2, false)])).toBe(0);
  });

  it('오늘 투두 0개 + 어제 100% → 1 (오늘은 건너뛰고 어제로 이어진다)', () => {
    expect(computeStreak([day(3, true), day(0, false)])).toBe(1);
  });

  it('투두 0개인 날은 중간에 있어도 건너뛰고(끊지 않고) 이어진다', () => {
    // 월(완료) · 화(투두 0개, 세지 않지만 끊지도 않는다) · 수(완료) → 완료한 2일이 이어진 것으로 센다.
    expect(computeStreak([day(2, true), day(0, false), day(1, true)])).toBe(2);
  });

  it('중간에 미완료가 있으면 그 지점에서 멈춘다', () => {
    // 옛날(미완료) · 그저께(완료) · 어제(완료) · 오늘(완료) → 뒤에서 3일만 센다.
    expect(computeStreak([day(1, false), day(1, true), day(1, true), day(1, true)])).toBe(3);
  });

  it('연속된 투두 0개 날은 전부 건너뛴다', () => {
    expect(computeStreak([day(1, true), day(0, false), day(0, false), day(1, true)])).toBe(2);
  });

  it('전부 투두 0개면 0이다', () => {
    expect(computeStreak([day(0, false), day(0, false)])).toBe(0);
  });
});
