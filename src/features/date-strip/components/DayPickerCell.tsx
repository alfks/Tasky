'use client';

import type { KeyboardEvent as ReactKeyboardEvent, Ref } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import {
  dayCellClass,
  dayNumberClass,
  type DayCellState,
} from '@/features/date-strip/lib/cell-classes';
import { formatCellName, formatDayNumber } from '@/features/date-strip/lib/format';
import { isWithinRange } from '@/features/date-strip/lib/week';

import { cn } from '@/lib/cn';

type DayPickerCellProps = {
  day: DateKey;
  state: DayCellState;
  /** roving tabindex 의 현재 진입점인지 — 격자에서 `tabIndex=0` 인 칸은 하나뿐이다. */
  isCursor: boolean;
  cellRef: Ref<HTMLButtonElement>;
  onPick: (date: DateKey) => void;
  onFocusCell: (date: DateKey, state: DayCellState) => void;
  onKeyDown: (event: ReactKeyboardEvent<HTMLButtonElement>) => void;
};

/**
 * 일 피커의 칸 하나 (calendar-layout.md §3-A R15-a·R17-a). 선택 채움·오늘 링·이 달 밖 흐림·강제 색
 * 모드 갈래는 `DateCell` 과 **같은 함수**(`lib/cell-classes.ts`)에서 나온다 — 여기서는 역할·이름·크기만
 * 정한다. 32×32(`--control-hit-min`)라 7칸 + 6간격 = 248px 로 280px 패널 안쪽(254)에 들어간다.
 */
export function DayPickerCell({
  day,
  state,
  isCursor,
  cellRef,
  onPick,
  onFocusCell,
  onKeyDown,
}: DayPickerCellProps) {
  return (
    <button
      ref={cellRef}
      type="button"
      role="gridcell"
      aria-selected={state.selected}
      aria-label={formatCellName({ date: day, isToday: state.today })}
      disabled={!isWithinRange(day)}
      tabIndex={isCursor ? 0 : -1}
      onClick={() => onPick(day)}
      onFocus={() => onFocusCell(day, state)}
      onKeyDown={onKeyDown}
      className={cn(
        'flex size-[var(--control-hit-min)] items-center justify-center rounded-[var(--radius-lg)] text-[length:var(--text-base)] leading-none',
        'motion-safe:transition-colors motion-safe:duration-[var(--motion-xfast)] motion-safe:ease-[var(--motion-ease)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:opacity-40',
        dayCellClass(state),
      )}
    >
      <span className={dayNumberClass(state)}>{formatDayNumber(day)}</span>
    </button>
  );
}
