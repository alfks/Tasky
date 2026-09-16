// 재배치가 행을 **새로 만들었을 때** 포커스를 그 행에 되돌려 준다 (todo.md §5, app-shell R14).
//
// `useFlipRows` 에서 떼어낸 이유: FLIP 은 "어디로 얼마나 움직이는가" 를 보고, 이쪽은 "누가 포커스를
// 들고 있었는가" 를 본다. 한 훅에 섞여 있으면 둘 중 하나를 고칠 때 다른 하나의 조건을 건드리게 된다.
import { useLayoutEffect, useRef, type RefObject } from 'react';

import { FLIP_ATTR } from '@/features/todo/components/todo-focus';

/**
 * 마지막으로 포커스를 받은 **행의 id** 를 기억해 두고, 재배치 뒤에 필요하면 되돌린다.
 *
 * 요소 참조가 아니라 id 인 이유: 완료 항목이 미완료 블록에서 완료 블록으로 갈 때 두 블록이 서로 다른
 * 자식 배열이라 React 는 그 행을 옮기지 않고 **한쪽에서 내리고 다른 쪽에 새로 만든다**. 옛 요소는
 * DOM 에서 끊어지므로 참조를 들고 있어도 되살릴 수 없다(Chromium 실측 — 포커스가 `<body>` 로 떨어졌다).
 *
 * 돌려주는 함수는 재배치 직후의 행 맵을 받아 복원한다. 조건은 **그 행의 DOM 이 갈렸을 때** 하나다
 * (`isConnected === false`). 자리만 바뀐 경우에는 브라우저가 포커스를 그대로 들고 있어 건드릴 이유가
 * 없고, 아무도 포커스를 가져가지 않았을 때만(= `body`) 되돌리므로 그 사이 사용자가 누른 곳을
 * 빼앗지도 않는다.
 */
export function useFocusedRow(
  containerRef: RefObject<HTMLElement | null>,
): (rows: Map<string, HTMLElement>) => void {
  const focusedRow = useRef<{ id: string; el: HTMLElement } | null>(null);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return undefined;
    const remember = (e: FocusEvent): void => {
      const row =
        e.target instanceof Element ? e.target.closest<HTMLElement>(`[${FLIP_ATTR}]`) : null;
      const id = row?.getAttribute(FLIP_ATTR);
      focusedRow.current = row === null || id === undefined || id === null ? null : { id, el: row };
    };
    container.addEventListener('focusin', remember);
    return () => container.removeEventListener('focusin', remember);
  }, [containerRef]);

  return (rows) => {
    const kept = focusedRow.current;
    if (kept === null || kept.el.isConnected || document.activeElement !== document.body) return;
    const reborn = rows.get(kept.id);
    if (reborn === undefined) return;
    focusedRow.current = { id: kept.id, el: reborn };
    reborn.focus();
  };
}
