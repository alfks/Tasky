// R8 대기 상태 기계 (todo.md R8).
//
// 픽스처는 **비대칭**이다: 미완료 3 · 완료 1 로 길이가 다르고, 완료 블록에 이미 c 가 들어 있어서
// "완료 블록으로 옮긴다" 를 "완료 블록을 통째로 바꾼다" 로 구현하면 c 가 사라져 드러난다.
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { COMPLETION_WAIT_MS, type BlockOrder } from '@/features/todo/components/todo-motion';
import { useCompletionMotion } from '@/features/todo/components/useCompletionMotion';

const 처음: BlockOrder = { incomplete: ['a', 'b', 'd'], completed: ['c'] };
const b체크: BlockOrder = { incomplete: ['a', 'd'], completed: ['b', 'c'] };
const bd체크: BlockOrder = { incomplete: ['a'], completed: ['d', 'b', 'c'] };

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function 띄우기(enabled = true, onSettled?: () => void) {
  return renderHook(
    ({ order }: { order: BlockOrder }) => useCompletionMotion(order, enabled, onSettled),
    { initialProps: { order: 처음 } },
  );
}

describe('대기 (R8)', () => {
  it('체크 직후에는 항목이 제자리에 남고 400ms 뒤에 내려간다', () => {
    const { result, rerender } = 띄우기();

    rerender({ order: b체크 });
    expect(result.current.order).toEqual(처음);
    expect(result.current.isWaiting).toBe(true);

    // 399ms 에는 아직이다 — 경계를 직접 밟는다(리터럴로도 한 번 더).
    act(() => {
      vi.advanceTimersByTime(399);
    });
    expect(result.current.order).toEqual(처음);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current.order).toEqual(b체크);
    expect(result.current.isWaiting).toBe(false);
  });

  it('대기 중 추가 토글은 타이머를 되감지 않고 같은 배치에 합류한다', () => {
    const { result, rerender } = 띄우기();

    rerender({ order: b체크 });
    act(() => {
      vi.advanceTimersByTime(300);
    });
    rerender({ order: bd체크 }); // 300ms 지점에서 d 도 체크
    expect(result.current.order).toEqual(처음);

    // 되감겼다면 여기서 아직 대기 중이어야 한다. 합류라면 첫 토글 기준 400ms 에 함께 내려간다.
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current.order).toEqual(bd체크);
  });

  it('대기 중 추가된 할 일은 숨기지 않고 바로 보여 준다 (R3 연속 입력)', () => {
    const { result, rerender } = 띄우기();

    rerender({ order: b체크 });
    rerender({ order: { incomplete: ['a', 'd', 'e'], completed: ['b', 'c'] } });

    expect(result.current.order).toEqual({ incomplete: ['a', 'b', 'd', 'e'], completed: ['c'] });
  });

  it('해제도 같은 규칙으로 되돌아간다', () => {
    const { result, rerender } = 띄우기();

    rerender({ order: b체크 });
    act(() => {
      vi.advanceTimersByTime(COMPLETION_WAIT_MS);
    });
    rerender({ order: 처음 }); // b 를 다시 해제

    expect(result.current.order).toEqual(b체크);
    act(() => {
      vi.advanceTimersByTime(COMPLETION_WAIT_MS);
    });
    expect(result.current.order).toEqual(처음);
  });

  it('추가·순서 변경만으로는 기다리지 않는다', () => {
    const { result, rerender } = 띄우기();

    rerender({ order: { incomplete: ['d', 'a', 'b'], completed: ['c'] } });

    expect(result.current.isWaiting).toBe(false);
    expect(result.current.order).toEqual({ incomplete: ['d', 'a', 'b'], completed: ['c'] });
  });

  it('reduced-motion 이면 대기 없이 즉시 재배치한다', () => {
    const { result, rerender } = 띄우기(false);

    rerender({ order: b체크 });

    expect(result.current.isWaiting).toBe(false);
    expect(result.current.order).toEqual(b체크);
  });

  it('이동이 끝난 순간 한 번만 알린다 (§5 낭독 시점)', () => {
    const settled = vi.fn();
    const { rerender } = 띄우기(true, settled);

    rerender({ order: b체크 });
    rerender({ order: bd체크 });
    expect(settled).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(COMPLETION_WAIT_MS);
    });
    expect(settled).toHaveBeenCalledTimes(1);
  });

  it('대기 중 날짜가 바뀌면 옛 날짜의 행을 붙들지 않는다', () => {
    const { result, rerender } = 띄우기();

    rerender({ order: b체크 });
    const 다른날 = { incomplete: ['x', 'y'], completed: [] };
    rerender({ order: 다른날 });

    expect(result.current.order).toEqual(다른날);
  });
});
