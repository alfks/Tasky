import type { DragEvent as ReactDragEvent } from 'react';

import { assertAccessibleName } from '@/lib/a11y';
import type { NonBlank } from '@/lib/a11y';
import { cn } from '@/lib/cn';
import { isImeKey } from '@/lib/ime';

type DragHandleProps<N extends string> = {
  /**
   * 순서를 바꾸는 **대상의 이름**(투두 제목·카테고리 이름). 접근 이름은 여기에 조작 안내를 붙여
   * 이 프리미티브가 만든다 — 같은 손잡이가 화면마다 다른 이름으로 불리면 낭독이 갈린다.
   */
  item: N & NonBlank<N>;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  /** `Alt+↑/↓`. 마우스를 쓸 수 없는 사람이 **같은 자리에서** 같은 일을 한다(WCAG 2.5.7). */
  onMove: (direction: -1 | 1) => void;
  className?: string;
};

/**
 * 드래그 손잡이. 드래그는 **여기서만** 시작한다 — 행 전체를 draggable 로 두면 글자를 선택하려는
 * 드래그가 순서 변경이 되어 버린다.
 *
 * 순서를 바꾸는 목록이 둘(투두 본문 · 카테고리 사이드바)이 되면서 `features/todo` 에서 올라왔다
 * (`components/AGENTS.md` 규칙 4 — 두 번째 사용처에서 사본을 만드는 것이 `features/AGENTS.md`
 * 규칙 5 가 막는 복제라, 승격이 유일하게 열린 길이었다).
 */
export function DragHandle<N extends string>({
  item,
  onDragStart,
  onDragEnd,
  onMove,
  className,
}: DragHandleProps<N>) {
  const label = `${item} 순서 변경 (Alt+위/아래)`;
  assertAccessibleName('DragHandle', 'item', item);

  return (
    <button
      type="button"
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onKeyDown={(e) => {
        if (isImeKey(e.nativeEvent) || !e.altKey) return;
        if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
        e.preventDefault();
        onMove(e.key === 'ArrowUp' ? -1 : 1);
      }}
      aria-label={label}
      className={cn(
        'inline-flex size-[var(--control-hit-min)] shrink-0 cursor-grab items-center justify-center',
        'rounded-[var(--radius-sm)] text-faint hover:bg-surface-2',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        className,
      )}
    >
      <span aria-hidden="true">⠿</span>
    </button>
  );
}
