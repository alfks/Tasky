// 픽스처는 **비대칭**이다: 길이 4 에 각 자리의 기대값이 전부 다르다. 기대값은 손으로 계산해 적었다 —
// 구현식(`over > from ? …`)을 다시 쓰면 식을 바꿔도 테스트가 따라가서 아무것도 잡지 못한다.
import { describe, expect, it } from 'vitest';

import { isAfterMidpoint, moveTargetIndex } from '@/lib/drag-order';

/** 순서대로 a b c d. */
const 수열 = ['a', 'b', 'c', 'd'];

describe('isAfterMidpoint', () => {
  it('중간을 넘겨야 뒤로 간다 — 정확히 중간은 앞이다', () => {
    const rect = { top: 100, height: 40 };
    expect(isAfterMidpoint(rect, 119)).toBe(false);
    expect(isAfterMidpoint(rect, 120)).toBe(false);
    expect(isAfterMidpoint(rect, 121)).toBe(true);
  });
});

describe('moveTargetIndex', () => {
  it('아래로 끌면 빼낸 뒤의 좌표라 한 칸 당겨진다', () => {
    // a 를 빼면 [b c d] — c 는 1번, 그 뒤는 2번.
    expect(moveTargetIndex(수열, 'a', 'c', false)).toBe(1);
    expect(moveTargetIndex(수열, 'a', 'c', true)).toBe(2);
  });

  it('위로 끌면 앞쪽 항목의 좌표가 그대로다', () => {
    // d 를 빼도 b 는 그대로 1번.
    expect(moveTargetIndex(수열, 'd', 'b', false)).toBe(1);
    expect(moveTargetIndex(수열, 'd', 'b', true)).toBe(2);
  });

  it('자기 위·수열 밖은 드롭을 받지 않는다', () => {
    expect(moveTargetIndex(수열, 'a', 'a', true)).toBeNull();
    expect(moveTargetIndex(수열, 'z', 'b', true)).toBeNull();
    expect(moveTargetIndex(수열, 'a', 'z', true)).toBeNull();
  });
});
