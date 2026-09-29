'use client';

// 항목 메뉴 "날짜 바꾸기…" 가 여는 일 피커 배선 (todo.md R10-b). 피커 자체는 date-strip 의
// `DayPickerPopover`(calendar-layout.md §3-A) — 여기서는 앵커·오늘·힌트·포커스 복귀만 잇는다.
//
// **열려 있는 동안만 마운트한다**(TodoItem 이 `pickingDate` 로 가른다). Popover 는 "항상 마운트하고
// open 만 토글" 이 관례지만 그 이유(닫혀 있어도 앵커에 aria-haspopup 이 붙어야 한다)는 앵커가
// **버튼**일 때 얘기다. 여기 앵커는 행(`<li>`) 이다 — 상시 마운트하면 목록의 모든 행이 "팝업 있음"
// 으로 읽힌다. `⋯` 버튼을 앵커로 쓰면 되지만 그 ref 는 `TodoItemMenu` 안에 있고 같은 앵커에 Popover
// 둘이 붙으면 aria 속성 기록이 서로를 덮는다. 그래서 행에 앵커하고, 열려 있는 동안만 속성이 붙는다.
import type { RefObject } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { DayPickerPopover, useDateStripStore } from '@/features/date-strip';
import { TODO_MESSAGES as M } from '@/features/todo/messages';

type TodoItemDatePickerProps = {
  value: DateKey;
  /** 행 자체 — 패널은 행의 오른쪽 끝(`bottom-end`)에 붙고, Esc 면 포커스가 행으로 돌아온다. */
  anchorRef: RefObject<HTMLElement | null>;
  /** 확정 직후 행이 사라졌을 때의 대체 포커스(useTodoItemFocus). */
  returnFocus: () => HTMLElement | null;
  /** 확정. 호출 전에 먼저 닫는다(`onClose`) — 행이 사라지기 전에 팝오버가 먼저 내려가야 한다. */
  onPick: (date: DateKey) => void;
  onClose: () => void;
};

export function TodoItemDatePicker({
  value,
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
      placement="bottom-end"
      value={value}
      today={today}
      hint={M.pickDateHint}
      returnFocus={returnFocus}
      onPick={(date) => {
        onClose();
        onPick(date);
      }}
    />
  );
}
