// R8 이동 모션의 순수 계산 (todo.md R8).
//
// 픽스처는 **비대칭**이다: 두 블록의 길이가 다르고(미완료 3 · 완료 1), id 도 알파벳 순과 배치 순이
// 어긋나게 두었다(c 가 완료 블록 첫 칸) — 두 블록을 바꿔 넣거나 순서를 뒤집으면 결과가 달라진다.
import { describe, expect, it } from 'vitest';

import {
  applyFrozenOrder,
  COMPLETION_WAIT_MS,
  hasCrossedBlocks,
  planFlip,
  sameBlockOrder,
  type BlockOrder,
} from '@/features/todo/components/todo-motion';

/** 얼리기 직전의 배치. */
const 얼린배치: BlockOrder = { incomplete: ['a', 'b', 'd'], completed: ['c'] };

describe('대기 시간 (R8)', () => {
  it('400ms 다', () => {
    // 리터럴과 상수를 **둘 다** 단언한다. 상수만 참조하면 값을 바꿔도 테스트가 따라가서 아무것도 안 잡는다.
    expect(COMPLETION_WAIT_MS).toBe(400);
    const 스펙값 = 400;
    expect(COMPLETION_WAIT_MS).toBe(스펙값);
  });
});

describe('applyFrozenOrder (R8 대기 중 배치)', () => {
  it('체크한 항목을 완료 블록으로 내리지 않고 제자리에 둔다', () => {
    // b 를 체크해 스토어는 이미 완료 블록으로 옮겨 놓았다.
    const 지금: BlockOrder = { incomplete: ['a', 'd'], completed: ['b', 'c'] };

    expect(applyFrozenOrder(얼린배치, 지금)).toEqual({
      incomplete: ['a', 'b', 'd'],
      completed: ['c'],
    });
  });

  it('대기 중 추가로 체크한 항목도 함께 제자리에 남는다', () => {
    const 지금: BlockOrder = { incomplete: ['a'], completed: ['d', 'b', 'c'] };

    expect(applyFrozenOrder(얼린배치, 지금)).toEqual({
      incomplete: ['a', 'b', 'd'],
      completed: ['c'],
    });
  });

  it('대기 중 사라진 항목(삭제·날짜 이동)은 내린다', () => {
    const 지금: BlockOrder = { incomplete: ['a', 'd'], completed: ['c'] };

    expect(applyFrozenOrder(얼린배치, 지금)).toEqual({ incomplete: ['a', 'd'], completed: ['c'] });
  });

  it('대기 중 새로 들어온 항목은 지금 배치가 정한 블록 끝에 붙는다', () => {
    const 지금: BlockOrder = { incomplete: ['a', 'd', 'e'], completed: ['b', 'c'] };

    // e 는 미완료 블록 끝에, 얼린 b 는 제자리에 남는다.
    expect(applyFrozenOrder(얼린배치, 지금)).toEqual({
      incomplete: ['a', 'b', 'd', 'e'],
      completed: ['c'],
    });
  });

  it('해제도 같은 규칙으로 되돌아간다 — 완료 항목은 대기 동안 완료 블록에 남는다', () => {
    const 지금: BlockOrder = { incomplete: ['a', 'b', 'c', 'd'], completed: [] };

    expect(applyFrozenOrder(얼린배치, 지금)).toEqual({
      incomplete: ['a', 'b', 'd'],
      completed: ['c'],
    });
  });
});

describe('sameBlockOrder', () => {
  it('순서가 다르면 다르다고 본다', () => {
    expect(sameBlockOrder(얼린배치, { incomplete: ['b', 'a', 'd'], completed: ['c'] })).toBe(false);
  });

  it('같은 항목이 다른 블록에 있으면 다르다고 본다', () => {
    expect(sameBlockOrder(얼린배치, { incomplete: ['a', 'b'], completed: ['d', 'c'] })).toBe(false);
  });

  it('같은 배치면 같다고 본다', () => {
    expect(sameBlockOrder(얼린배치, { incomplete: ['a', 'b', 'd'], completed: ['c'] })).toBe(true);
  });
});

describe('hasCrossedBlocks (대기를 시작할 조건)', () => {
  it('미완료가 완료로 넘어가면 참이다', () => {
    expect(hasCrossedBlocks(얼린배치, { incomplete: ['a', 'd'], completed: ['b', 'c'] })).toBe(
      true,
    );
  });

  it('완료가 미완료로 돌아와도 참이다', () => {
    expect(hasCrossedBlocks(얼린배치, { incomplete: ['a', 'b', 'c', 'd'], completed: [] })).toBe(
      true,
    );
  });

  it('추가만으로는 거짓이다 — 새 할 일을 400ms 숨기지 않는다', () => {
    expect(hasCrossedBlocks(얼린배치, { incomplete: ['a', 'b', 'd', 'e'], completed: ['c'] })).toBe(
      false,
    );
  });

  it('순서 변경만으로는 거짓이다 — 드래그가 멈칫하지 않는다', () => {
    expect(hasCrossedBlocks(얼린배치, { incomplete: ['d', 'a', 'b'], completed: ['c'] })).toBe(
      false,
    );
  });

  it('삭제만으로는 거짓이다', () => {
    expect(hasCrossedBlocks(얼린배치, { incomplete: ['a', 'd'], completed: ['c'] })).toBe(false);
  });
});

describe('planFlip', () => {
  it('이전 자리 − 지금 자리를 `dy` 로 준다', () => {
    const before = new Map([
      ['a', 0],
      ['b', 40],
      ['c', 80],
    ]);
    const after = new Map([
      ['a', 0],
      ['c', 40],
      ['b', 80],
    ]);

    // a 는 0 이동이라 빠지고, b 는 위에서 아래로(양수 dy 로 되감는다), c 는 반대다.
    expect(planFlip(before, after)).toEqual([
      { id: 'c', dy: 40 },
      { id: 'b', dy: -40 },
    ]);
  });

  it('새로 들어온 행은 움직이지 않는다 — 날아올 자리가 없다', () => {
    expect(
      planFlip(
        new Map([['a', 0]]),
        new Map([
          ['a', 40],
          ['z', 0],
        ]),
      ),
    ).toEqual([{ id: 'a', dy: -40 }]);
  });

  it('자리가 그대로면 빈 배열이다', () => {
    const same = new Map([
      ['a', 0],
      ['b', 40],
    ]);
    expect(planFlip(same, new Map(same))).toEqual([]);
  });
});
