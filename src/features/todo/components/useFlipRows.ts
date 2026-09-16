// R8 의 FLIP: 재배치가 커밋된 직후 각 행을 **이전 자리**로 되돌려 놓고 새 자리로 transition 시킨다.
// 이렇게 해야 "이동 중 다른 항목이 자리를 밀어 올리는" 모습이 나온다 — 옮겨지는 행만 움직이면
// 나머지는 순간이동하고, 그 차이가 R8 의 사용감을 통째로 바꾼다.
import { useLayoutEffect, useRef, type RefObject } from 'react';

import { FLIP_ATTR } from '@/features/todo/components/todo-focus';
import { planFlip } from '@/features/todo/components/todo-motion';
import { useFocusedRow } from '@/features/todo/components/useFocusedRow';

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

/** Invert(이전 자리로 되돌리기) → 다음 프레임에 Play. 예약한 프레임 번호를 `frames` 에 쌓는다. */
function animate(
  rows: Map<string, HTMLElement>,
  moves: readonly { id: string; dy: number }[],
  frames: number[],
): void {
  for (const { id, dy } of moves) {
    const row = rows.get(id);
    if (row === undefined) continue;
    row.style.transition = 'none';
    row.style.transform = `translateY(${dy}px)`;
    frames.push(
      requestAnimationFrame(() => {
        row.style.transition = 'transform var(--motion-base) var(--motion-ease)';
        row.style.transform = '';
        row.addEventListener(
          'transitionend',
          () => {
            row.style.transition = '';
          },
          { once: true },
        );
      }),
    );
  }
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
  const restoreFocus = useFocusedRow(containerRef);

  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container === null) return;
    const rows = measure(container);
    const after = new Map<string, number>();
    for (const [id, row] of rows) after.set(id, row.offsetTop);
    const before = previous.current;
    previous.current = after;
    const moves = planFlip(before, after);
    restoreFocus(rows);
    if (enabled) animate(rows, moves, frames.current);
  });

  useLayoutEffect(
    () => () => {
      for (const frame of frames.current) cancelAnimationFrame(frame);
      frames.current = [];
    },
    [],
  );
}
