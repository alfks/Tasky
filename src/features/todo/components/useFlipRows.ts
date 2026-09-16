// R8 의 FLIP: 재배치가 커밋된 직후 각 행을 **이전 자리**로 되돌려 놓고 새 자리로 transition 시킨다.
// 이렇게 해야 "이동 중 다른 항목이 자리를 밀어 올리는" 모습이 나온다 — 옮겨지는 행만 움직이면
// 나머지는 순간이동하고, 그 차이가 R8 의 사용감을 통째로 바꾼다.
import { useLayoutEffect, useRef, type RefObject } from 'react';

import { planFlip } from '@/features/todo/components/todo-motion';

/** 행을 찾는 표식. `id` 가 아니라 전용 속성인 이유는 목록 밖 요소를 잡지 않기 위해서다. */
export const FLIP_ATTR = 'data-flip-id';

/**
 * **`offsetTop` 으로 잰다**(`getBoundingClientRect` 가 아니라). 뷰포트 기준 좌표는 스크롤만 해도
 * 달라져서, 스크롤 직후의 아무 렌더에서나 목록 전체가 "움직였다" 고 판정된다. `offsetTop` 은
 * 레이아웃 위치라 스크롤과 무관하고, **transform 의 영향도 받지 않아** 애니메이션이 겹쳐도
 * 측정이 흔들리지 않는다.
 */
function measure(container: HTMLElement): Map<string, HTMLElement> {
  const rows = new Map<string, HTMLElement>();
  for (const row of container.querySelectorAll<HTMLElement>(`[${FLIP_ATTR}]`)) {
    const id = row.getAttribute(FLIP_ATTR);
    if (id !== null) rows.set(id, row);
  }
  return rows;
}

/**
 * 컨테이너 안에서 `data-flip-id` 를 단 행들을 FLIP 애니메이션한다.
 *
 * 매 커밋마다 위치를 기록하므로, 자리 이동의 원인(완료 이동·순서 변경·추가·삭제)을 가리지 않는다.
 * `enabled=false`(reduced-motion)면 기록만 하고 애니메이션은 하지 않는다 — 기록을 멈추면 설정을
 * 켰다 끈 직후 한 번 엉뚱한 거리로 날아간다.
 */
export function useFlipRows(containerRef: RefObject<HTMLElement | null>, enabled: boolean): void {
  const previous = useRef<Map<string, number>>(new Map());
  const frames = useRef<number[]>([]);
  const focusedRow = useRef<{ id: string; el: HTMLElement } | null>(null);

  /**
   * 마지막으로 포커스를 받은 **행의 id** 를 기억한다 — 요소 참조가 아니라 id 인 이유:
   * 완료 항목이 미완료 블록에서 완료 블록으로 갈 때 두 블록이 서로 다른 자식 배열이라 React 는
   * 그 행을 옮기지 않고 **한쪽에서 내리고 다른 쪽에 새로 만든다**. 옛 요소는 DOM 에서 끊어지므로
   * 참조를 들고 있어도 되살릴 수 없다(Chromium 실측 — 포커스가 `<body>` 로 떨어졌다).
   */
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

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const rows = measure(container);
    const after = new Map<string, number>();
    for (const [id, row] of rows) after.set(id, row.offsetTop);
    const before = previous.current;
    previous.current = after;
    const moves = planFlip(before, after);
    // React 가 행을 `insertBefore` 로 옮기면 그 행에 있던 포커스가 `<body>` 로 떨어진다(Chromium 실측).
    // 완료 항목이 아래로 내려가도 포커스는 그 항목에 남아야 한다(todo.md §5). 아무도 포커스를 가져가지
    // 않았을 때만(= `body`) 되돌리므로, 사용자가 그 사이 다른 곳을 눌렀다면 빼앗지 않는다.
    // 완료 항목이 아래로 내려가도 포커스는 그 항목에 남아야 한다(todo.md §5).
    //
    // 되돌리는 조건은 **그 행의 DOM 이 갈렸을 때** 하나다(`isConnected === false`). 자리만 바뀐
    // 경우에는 브라우저가 포커스를 그대로 들고 있으므로 건드릴 이유가 없고, 아무도 포커스를
    // 가져가지 않았을 때만(= `body`) 되돌리므로 그 사이 사용자가 누른 곳을 빼앗지도 않는다.
    const kept = focusedRow.current;
    if (kept !== null && !kept.el.isConnected && document.activeElement === document.body) {
      const reborn = rows.get(kept.id);
      if (reborn !== undefined) {
        focusedRow.current = { id: kept.id, el: reborn };
        reborn.focus();
      }
    }
    if (!enabled) return;

    for (const { id, dy } of moves) {
      const row = rows.get(id);
      if (row === undefined) continue;
      row.style.transition = 'none';
      row.style.transform = `translateY(${dy}px)`;
      const frame = requestAnimationFrame(() => {
        row.style.transition = 'transform var(--motion-base) var(--motion-ease)';
        row.style.transform = '';
        row.addEventListener(
          'transitionend',
          () => {
            row.style.transition = '';
          },
          { once: true },
        );
      });
      frames.current.push(frame);
    }
  });

  useLayoutEffect(
    () => () => {
      for (const frame of frames.current) cancelAnimationFrame(frame);
      frames.current = [];
    },
    [],
  );
}
