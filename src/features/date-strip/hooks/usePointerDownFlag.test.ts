// 포인터 플래그 (date-strip.md R16) — 켜는 것은 캡처 핸들러, 푸는 것은 window 의 pointerup/pointercancel.
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { usePointerDownFlag } from '@/features/date-strip/hooks/usePointerDownFlag';

describe('usePointerDownFlag', () => {
  it('처음엔 꺼져 있고, 캡처 핸들러가 켠다', () => {
    const { result } = renderHook(() => usePointerDownFlag());
    expect(result.current.isPointerDown.current).toBe(false);
    act(() => result.current.onPointerDownCapture());
    expect(result.current.isPointerDown.current).toBe(true);
  });

  it('window 의 pointerup 이 푼다 — 요소 밖에서 놓아도(드래그하다 놓침) 풀린다', () => {
    const { result } = renderHook(() => usePointerDownFlag());
    act(() => result.current.onPointerDownCapture());
    act(() => {
      document.body.dispatchEvent(new Event('pointerup', { bubbles: true }));
    });
    expect(result.current.isPointerDown.current).toBe(false);
  });

  it('pointercancel(터치 취소·스크롤로 전환)도 푼다', () => {
    const { result } = renderHook(() => usePointerDownFlag());
    act(() => result.current.onPointerDownCapture());
    act(() => {
      window.dispatchEvent(new Event('pointercancel'));
    });
    expect(result.current.isPointerDown.current).toBe(false);
  });

  it('언마운트하면 window 리스너를 거둔다', () => {
    const { result, unmount } = renderHook(() => usePointerDownFlag());
    const flag = result.current.isPointerDown;
    act(() => result.current.onPointerDownCapture());
    unmount();
    window.dispatchEvent(new Event('pointerup'));
    // 리스너가 남아 있었다면 false 가 됐을 것이다 — 죽은 컴포넌트의 ref 를 건드리지 않는다.
    expect(flag.current).toBe(true);
  });
});
