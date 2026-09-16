// 순서 변경 좌표 (todo.md R11).
//
// 픽스처는 **비대칭**이다: 완료 항목이 수열 가운데(index 2)에 끼어 있고 길이가 5라, 앞뒤를 뒤집거나
// 완료 항목을 빠뜨려도 같은 숫자가 나오지 않는다. 기대값은 손으로 계산해 적었다 — 구현식을 다시
// 쓰면(`over > from ? … `) 식을 바꿔도 테스트가 따라가서 아무것도 잡지 못한다.
import { describe, expect, it } from 'vitest';

import {
  dropTargetIndex,
  incompletePosition,
  isAfterMidpoint,
  type DragSlot,
} from '@/features/todo/components/todo-drag';

/** order 순 수열: a b [C완료] d e */
const 수열: DragSlot[] = [
  { id: 'a', done: false },
  { id: 'b', done: false },
  { id: 'C', done: true },
  { id: 'd', done: false },
  { id: 'e', done: false },
];

describe('dropTargetIndex', () => {
  it('아래로 끌어 뒤쪽 행의 아래에 놓으면 그 행 다음 자리다', () => {
    // a 를 빼면 [b C d e] — d 는 2번, 그 뒤는 3번이라 결과는 [b C d a e].
    expect(dropTargetIndex(수열, 'a', 'd', true)).toBe(3);
  });

  it('아래로 끌어 뒤쪽 행의 위에 놓으면 그 행 자리다', () => {
    expect(dropTargetIndex(수열, 'a', 'd', false)).toBe(2);
  });

  it('위로 끌어 앞쪽 행의 위에 놓으면 그 행 자리다', () => {
    // e 를 빼도 a 는 그대로 0번 — 결과는 [e a b C d].
    expect(dropTargetIndex(수열, 'e', 'a', false)).toBe(0);
  });

  it('위로 끌어 앞쪽 행의 아래에 놓으면 그 행 다음 자리다', () => {
    expect(dropTargetIndex(수열, 'e', 'a', true)).toBe(1);
  });

  it('바로 아래 이웃의 아래에 놓으면 한 칸 내려간다', () => {
    expect(dropTargetIndex(수열, 'a', 'b', true)).toBe(1);
  });

  it('완료 항목 위에는 놓을 수 없다', () => {
    expect(dropTargetIndex(수열, 'a', 'C', true)).toBeNull();
  });

  it('완료 항목을 끌 수 없다', () => {
    expect(dropTargetIndex(수열, 'C', 'a', true)).toBeNull();
  });

  it('자기 자신 위에는 놓을 수 없다', () => {
    expect(dropTargetIndex(수열, 'a', 'a', false)).toBeNull();
  });

  it('다른 그룹의 항목은 받지 않는다', () => {
    expect(dropTargetIndex(수열, 'zzz', 'a', false)).toBeNull();
    expect(dropTargetIndex(수열, 'a', 'zzz', false)).toBeNull();
  });
});

describe('isAfterMidpoint', () => {
  it('행의 세로 중간을 넘으면 뒤로 본다', () => {
    expect(isAfterMidpoint({ top: 100, height: 40 }, 121)).toBe(true);
    expect(isAfterMidpoint({ top: 100, height: 40 }, 119)).toBe(false);
  });

  it('정확히 중간이면 앞으로 본다', () => {
    expect(isAfterMidpoint({ top: 100, height: 40 }, 120)).toBe(false);
  });
});

describe('incompletePosition (낭독용 위치)', () => {
  it('완료 항목을 빼고 1부터 센다', () => {
    // 미완료만 보면 a b d e — d 는 3번째다(수열 인덱스 3 과 다른 값이라 둘을 섞으면 드러난다).
    expect(incompletePosition(수열, 'd')).toBe(3);
    expect(incompletePosition(수열, 'e')).toBe(4);
  });

  it('완료 항목은 자리가 없다', () => {
    expect(incompletePosition(수열, 'C')).toBeNull();
  });
});
