import { useEffect, useRef } from 'react';
import type {
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
  RefObject,
} from 'react';

import type { TodoId } from '@/domain/ids';

const HOLD_MS = 400;
const CANCEL_DISTANCE_PX = 8;

type Press = { pointerId: number; x: number; y: number; timer: number };

/** 짧은 탭은 스크롤과 메뉴에 맡기고, 누른 뒤 움직일 때만 순서 변경을 시작한다. */
export function useTodoLongPress(
  rowRef: RefObject<HTMLLIElement | null>,
  id: TodoId,
  enabled: boolean,
  onDragChange: (id: TodoId | null) => void,
  onDrop: (sourceId: TodoId, overId: TodoId, after: boolean) => void,
) {
  const pending = useRef<Press | null>(null);
  const active = useRef<number | null>(null);
  const target = useRef<HTMLElement | null>(null);
  const suppressUntil = useRef(0);
  const callbacks = useRef({ onDragChange, onDrop });
  callbacks.current = { onDragChange, onDrop };
  const touchListener = useRef((event: TouchEvent): void => {
    if (active.current !== null && event.cancelable) event.preventDefault();
  }).current;

  const clearTarget = (): void => {
    target.current?.removeAttribute('data-todo-drop-target');
    target.current = null;
  };

  const stop = (): void => {
    if (pending.current !== null) window.clearTimeout(pending.current.timer);
    pending.current = null;
    const captured = active.current;
    active.current = null;
    if (captured !== null) {
      try {
        if (rowRef.current?.hasPointerCapture?.(captured))
          rowRef.current.releasePointerCapture(captured);
      } catch {
        // The browser may have released capture already.
      }
      callbacks.current.onDragChange(null);
    }
    clearTarget();
    document.removeEventListener('touchmove', touchListener);
  };

  useEffect(() => {
    const onBlur = () => stop();
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('blur', onBlur);
      stop();
    };
    // Lifecycle cleanup uses refs; adding callback identities would cancel an active gesture on rerender.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hit = (x: number, y: number): HTMLElement | null => {
    const element = document.elementFromPoint?.(x, y);
    const row =
      element instanceof HTMLElement ? element.closest<HTMLElement>('[data-todo-id]') : null;
    // 순서 변경은 같은 그룹 안에서만 받는다. 다른 그룹에는 드롭 표시도 하지 않는다.
    return row?.closest('ul') === rowRef.current?.closest('ul') ? row : null;
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLLIElement>): void => {
    if (!enabled || !event.isPrimary || event.button !== 0 || typeof event.pointerId !== 'number')
      return;
    const node = event.target;
    if (
      node instanceof Element &&
      node.closest('button:not([data-todo-title]), input, textarea, a, [data-no-row-menu]')
    )
      return;
    stop();
    const pointerId = event.pointerId;
    const x = event.clientX;
    const y = event.clientY;
    const timer = window.setTimeout(() => {
      if (pending.current?.pointerId !== pointerId) return;
      pending.current = null;
      active.current = pointerId;
      suppressUntil.current = Date.now() + 700;
      try {
        if (rowRef.current === null) {
          stop();
          return;
        }
        rowRef.current.setPointerCapture?.(pointerId);
      } catch {
        stop();
        return;
      }
      callbacks.current.onDragChange(id);
      document.addEventListener('touchmove', touchListener, { passive: false });
    }, HOLD_MS);
    pending.current = { pointerId, x, y, timer };
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLLIElement>): void => {
    const press = pending.current;
    if (press !== null && press.pointerId === event.pointerId) {
      const distance = Math.hypot(event.clientX - press.x, event.clientY - press.y);
      if (distance > CANCEL_DISTANCE_PX) stop();
      return;
    }
    if (active.current !== event.pointerId) return;
    const next = hit(event.clientX, event.clientY);
    if (next === target.current) return;
    clearTarget();
    if (next !== null && next !== rowRef.current) {
      next.setAttribute('data-todo-drop-target', '');
      target.current = next;
    }
  };

  const onPointerUp = (event: ReactPointerEvent<HTMLLIElement>): void => {
    try {
      if (active.current === event.pointerId) {
        suppressUntil.current = Date.now() + 500;
        const over = hit(event.clientX, event.clientY);
        const overId = over?.getAttribute('data-todo-id') as TodoId | null;
        if (over !== null && overId !== null && overId !== id) {
          const rect = over.getBoundingClientRect();
          callbacks.current.onDrop(id, overId, event.clientY > rect.top + rect.height / 2);
        }
      }
    } finally {
      if (active.current === event.pointerId || pending.current?.pointerId === event.pointerId)
        stop();
    }
  };

  const consumeClick = (): boolean => {
    if (Date.now() > suppressUntil.current) return false;
    suppressUntil.current = 0;
    return true;
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel: stop,
    onContextMenu: (event: ReactMouseEvent) => {
      if (active.current !== null || pending.current !== null) event.preventDefault();
    },
    consumeClick,
  };
}
