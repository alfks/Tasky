'use client';

// 항목 메뉴 "날짜 바꾸기…" 가 여는 일 피커 배선 (todo.md R10-b). 피커 자체는 date-strip 의
// `DayPickerPopover`(calendar-layout.md §3-A) — 여기서는 앵커·오늘·힌트·포커스 복귀만 잇는다.
//
// **열려 있는 동안만 마운트한다**(TodoItem 이 `pickingDate` 로 가른다). 앵커는 그 행의 `⋯` 버튼이다 —
// 메뉴 Popover 가 상시로 붙여 둔 `aria-haspopup="menu"` 를 이 팝오버가 열린 동안만 `"grid"` 로 덮고
// 닫히면 되돌린다(Popover 의 앵커 속성 기록). 닫힐 때 포커스도 그 `⋯` 로 돌아간다.
import type { RefObject } from 'react';

import type { DateKey } from '@/domain/date/date-key';
import type { Todo } from '@/domain/todo/todo';

import { DayPickerPopover, useDateStripStore } from '@/features/date-strip';
import { TODO_MESSAGES as M } from '@/features/todo/messages';

type TodoItemDatePickerProps = {
  todo: Todo;
  /** 그 행의 `⋯` 버튼. 패널은 그 아래(자리가 없으면 위) 오른쪽 끝에 붙는다. */
  anchorRef: RefObject<HTMLButtonElement | null>;
  /** 확정 직후 행이 사라졌을 때의 대체 포커스(useTodoItemFocus). */
  returnFocus: () => HTMLElement | null;
  /** 확정. 호출 전에 먼저 닫는다(`onClose`) — 행이 사라지기 전에 팝오버가 먼저 내려가야 한다. */
  onPick: (date: DateKey) => void;
  onClose: () => void;
};

export function TodoItemDatePicker({
  todo,
  anchorRef,
  returnFocus,
  onPick,
  onClose,
}: TodoItemDatePickerProps) {
  const today = useDateStripStore((state) => state.today);
  return (
    <DayPickerPopover
      open
      onClose={onClose}
      anchorRef={anchorRef}
      align="end"
      value={todo.date}
      today={today}
      hint={M.pickDateHint(todo.title)}
      returnFocus={returnFocus}
      onPick={(date) => {
        onClose();
        onPick(date);
      }}
    />
  );
}
