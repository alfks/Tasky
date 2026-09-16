// R8 "체크 → 400ms 대기 → 완료 블록으로 이동" 의 상태 기계. 순수 계산은 `todo-motion.ts` 에 있다.
import { useEffect, useRef, useState } from 'react';

import {
  applyFrozenOrder,
  COMPLETION_WAIT_MS,
  hasCrossedBlocks,
  sameBlockOrder,
  type BlockOrder,
} from '@/features/todo/components/todo-motion';

type MotionState = {
  /** 직전 렌더가 본 배치. 토글을 알아채는 기준선이다. */
  previous: BlockOrder;
  /** 대기 중이면 **첫 토글 직전의** 배치, 아니면 null. 추가 토글은 이 값을 바꾸지 않는다(R8 "함께 이동"). */
  frozen: BlockOrder | null;
};

type CompletionMotion = {
  /** 지금 그려야 할 배치. 대기 중이면 얼려 둔 자리, 아니면 스토어가 준 그대로. */
  order: BlockOrder;
  /** 대기 중인가 — 이동 직전임을 아는 쪽(테스트·낭독 시점)이 쓴다. */
  isWaiting: boolean;
};

/**
 * 완료 토글이 일어나면 그룹 배치를 `COMPLETION_WAIT_MS` 동안 얼려 두고, 대기가 끝나면 풀어 준다.
 *
 * **대기 시작 판정을 렌더 중에 한다.** `useEffect` 로 미루면 이미 옮겨진 배치가 한 프레임 그려지고,
 * 사용자는 항목이 아래로 튀었다가 다시 올라와 400ms 뒤 또 내려가는 것을 본다(R8 이 금지하는 모습).
 * 렌더 중 `setState` 는 React 가 커밋 전에 다시 렌더하므로 화면에 나가지 않는다.
 *
 * `enabled=false`(reduced-motion)면 한 번도 얼리지 않는다 — 즉시 재배치, 모션 없음(R8).
 */
export function useCompletionMotion(
  current: BlockOrder,
  enabled: boolean,
  onSettled?: () => void,
): CompletionMotion {
  const [state, setState] = useState<MotionState>(() => ({ previous: current, frozen: null }));
  const settle = useRef(onSettled);
  settle.current = onSettled;

  let live = state;
  if (!sameBlockOrder(state.previous, current)) {
    const toggled = enabled && hasCrossedBlocks(state.previous, current);
    live = {
      previous: current,
      // 이미 얼어 있으면 그대로 둔다: 대기 중 추가 토글은 타이머를 되감지 않고 같은 배치에 합류한다.
      frozen: toggled ? (state.frozen ?? state.previous) : state.frozen,
    };
    setState(live);
  }

  const { frozen } = live;
  useEffect(() => {
    if (frozen === null) return undefined;
    const timer = setTimeout(() => {
      setState((prev) => (prev.frozen === frozen ? { ...prev, frozen: null } : prev));
      settle.current?.();
    }, COMPLETION_WAIT_MS);
    return () => clearTimeout(timer);
    // `frozen` 은 첫 토글 때 한 번 만들어진 객체라 추가 토글로 바뀌지 않는다 — 타이머가 재시작되지 않는다.
  }, [frozen]);

  return {
    order: frozen === null ? current : applyFrozenOrder(frozen, current),
    isWaiting: frozen !== null,
  };
}
