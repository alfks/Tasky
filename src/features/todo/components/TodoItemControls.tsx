'use client';

import type { DragEvent as ReactDragEvent } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { isDateKey } from '@/lib/date';
import { isImeKey } from '@/lib/ime';

/**
 * 드래그 손잡이 (R11). 드래그는 **여기서만** 시작한다 — 행 전체를 draggable 로 두면 제목을 선택하려는
 * 드래그가 순서 변경이 되어 버린다. 같은 버튼에 `Alt+↑/↓` 를 붙여, 손잡이에 포커스한 키보드 사용자가
 * 마우스와 같은 자리에서 같은 일을 할 수 있게 한다(WCAG 2.5.7).
 */
export function DragHandle({
  title,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  title: string;
  onDragStart: (event: ReactDragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
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
      aria-label={`${title} 순서 변경 (Alt+위/아래)`}
      className="inline-flex size-[var(--control-hit-min)] shrink-0 cursor-grab items-center justify-center rounded-[var(--radius-sm)] text-faint hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
    >
      <span aria-hidden="true">⠿</span>
    </button>
  );
}

/** 메뉴 "날짜 바꾸기…" 가 펼치는 **네이티브** 날짜 입력 (R10-b). 달력 UI 를 직접 만들지 않는다. */
export function DatePickRow({
  date,
  onPick,
  onDismiss,
}: {
  date: DateKey;
  onPick: (next: DateKey) => void;
  onDismiss: () => void;
}) {
  return (
    <label className="flex items-center gap-[var(--space-2)] pl-[var(--space-8)] text-sm text-muted">
      날짜 바꾸기
      <input
        type="date"
        autoFocus
        defaultValue={date}
        onChange={(e) => {
          if (isDateKey(e.target.value)) onPick(e.target.value);
        }}
        onBlur={onDismiss}
        className="h-[var(--control-height)] rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-2)] text-base text-text"
      />
    </label>
  );
}
