import { describe, expect, it } from 'vitest';

import { computeStreak } from '@/domain/todo/streak';

describe('computeStreak (stats.md R4)', () => {
  it('빈 배열이면 0이다', () => {
    expect(computeStreak([], 0)).toBe(0);
  });

  it('전부 완료면 배열 길이만큼이다', () => {
    expect(computeStreak([true, true, true], 2)).toBe(3);
  });

  it('어제 100% + 오늘 미완료 → 스트릭 0 (완료 조건 경계)', () => {
    // index 0 = 어제(true), index 1 = 오늘(false)
    expect(computeStreak([true, false], 1)).toBe(0);
  });

  it('중간에 끊기면 그 지점 이후만 센다', () => {
    // false, true, true, true 를 뒤에서부터 훑으면 3
    expect(computeStreak([false, true, true, true], 3)).toBe(3);
  });

  it('from 이전 값이 더 있어도 개의치 않고 from 부터만 본다', () => {
    // from=1 이면 index 2 는 안 본다(더 길게 이어져도 무시).
    expect(computeStreak([true, true, false], 1)).toBe(2);
  });

  it('투두 0개 날 건너뛰기는 호출부가 배열에서 그 날짜를 빼는 방식으로 표현된다', () => {
    // 예: 월(완료) · 화(투두 0개, 배열에서 제외) · 수(완료) → [월, 수] = [true, true] 로 이어진다.
    // 이 함수 자체는 "제외됐다"는 사실을 모르고 그냥 인접한 true 를 센다 — 그것이 "자연히 맞아떨어진다"는 뜻이다.
    expect(computeStreak([true, true], 1)).toBe(2);
  });

  it('from 이 범위를 벗어나면(음수·길이 이상) 0이다', () => {
    expect(computeStreak([true, true], -1)).toBe(0);
    expect(computeStreak([true, true], 2)).toBe(0);
  });

  it('from 이 정수가 아니면 0이다', () => {
    expect(computeStreak([true, true], 1.5)).toBe(0);
  });
});
