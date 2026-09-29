// 포인터가 눌린 동안만 켜지는 플래그 (date-strip.md R16 — 포인터로 들어온 포커스는 격자를 옮기지 않는다).
//
// 마우스 클릭은 pointerdown → (mousedown →) focus → pointerup → click 순서다. focus 시점에 화면을
// 다시 그리면 click 이 떨어질 요소가 사라질 수 있어(이 달 밖 칸의 실브라우저 재현 버그), focus
// 핸들러가 "지금 포인터가 눌린 채인가" 를 물어 거를 수 있게 한다. 켜는 쪽은 돌려주는 캡처 핸들러
// (칸의 focus 보다 먼저 돈다), 푸는 쪽은 **window** 의 pointerup/pointercancel 이다 — 요소 위에서
// 누르고 밖에서 놓으면(드래그하다 놓침) pointerup 은 포인터 아래 요소에서 나서 요소 자신의 핸들러로는
// 못 받고, 안 풀리면 다음 Tab 진입의 포커스가 걸러진다.
import { useEffect, useRef, type RefObject } from 'react';

export function usePointerDownFlag(): {
  /** 포인터가 눌린 채인가. 렌더를 일으키지 않는 ref 다 — 이벤트 핸들러 안에서만 읽는다. */
  isPointerDown: RefObject<boolean>;
  /** 플래그를 켤 요소(칸 묶음을 덮는 상자)의 `onPointerDownCapture` 에 건다. */
  onPointerDownCapture: () => void;
} {
  const isPointerDown = useRef(false);

  useEffect(() => {
    const release = () => {
      isPointerDown.current = false;
    };
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, []);

  const onPointerDownCapture = () => {
    isPointerDown.current = true;
  };

  return { isPointerDown, onPointerDownCapture };
}
