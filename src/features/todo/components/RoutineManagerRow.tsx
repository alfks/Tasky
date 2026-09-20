'use client';

// 루틴 관리 화면의 행 한 줄 (routine.md §2·R7·R7-a·R10). category.md §2-A `CategoryListItem` 의
// 행 + `⋯` 메뉴 구조를 그대로 본떴다 — 새 UI 문법을 만들지 않는다.
//
// **`⋯` 메뉴가 행마다 다르다(R7-a)**: 종료일이 있는 루틴(기록)은 중지·재개 항목 자체가 없다
// (회색 비활성이 아니라 항목이 아예 메뉴에 없음) — `R3`가 등록 즉시 끝까지 채워서 지연 생성이
// 없고, 중지해도 멈출 것이 없기 때문이다.
import { useRef, useState } from 'react';

import type { Category } from '@/domain/category/category';
import type { Routine } from '@/domain/routine/routine';

import { routineScheduleLabel } from '@/features/todo/components/routine-schedule-label';

import { IconButton } from '@/components/ui/IconButton';
import { Menu } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';

/** `Menu` 의 항목 모양 — 프리미티브가 타입을 export 하지 않아 구조적으로 맞춘다(TodoItemMenu 와 같은 방식). */
type MenuRow = { id: string; label: string; onSelect: () => void; destructive?: boolean };

type RoutineManagerRowProps = {
  routine: Routine;
  /** 이 루틴이 가리키는 카테고리. 삭제됐으면 `undefined`(routine.md R11) — 점을 그리지 않는다. */
  category: Category | undefined;
  onPause: () => void;
  onResume: () => void;
  onRemove: () => void;
  /** 메뉴가 열릴 때 — 삭제로 이 행이 사라지기 **전에** 자리표를 뜬다(app-shell R14). */
  onOpenMenu?: () => void;
  /** 메뉴를 닫을 때 `⋯` 가 이미 사라졌으면(삭제 직후) 대신 포커스할 곳. */
  returnFocus?: () => HTMLElement | null;
};

export function RoutineManagerRow({
  routine,
  category,
  onPause,
  onResume,
  onRemove,
  onOpenMenu,
  returnFocus,
}: RoutineManagerRowProps) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const close = (): void => setOpen(false);
  const run =
    (action: () => void): (() => void) =>
    () => {
      close();
      action();
    };

  const menuLabel = `${routine.title} 루틴 메뉴`;
  const items: MenuRow[] =
    routine.endDate !== undefined
      ? [{ id: 'remove', label: '삭제', destructive: true, onSelect: run(onRemove) }]
      : routine.active
        ? [
            { id: 'pause', label: '중지', onSelect: run(onPause) },
            { id: 'remove', label: '삭제', destructive: true, onSelect: run(onRemove) },
          ]
        : [
            { id: 'resume', label: '재개', onSelect: run(onResume) },
            { id: 'remove', label: '삭제', destructive: true, onSelect: run(onRemove) },
          ];

  return (
    <li className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-2)] py-[var(--space-1)]">
      {category === undefined ? null : (
        <span
          aria-hidden="true"
          style={{ backgroundColor: category.color }}
          className="inline-block size-[12px] shrink-0 rounded-full"
        />
      )}
      <span className="min-w-0 flex-1 truncate text-base text-text">
        {category?.emoji === undefined ? null : <span aria-hidden="true">{category.emoji} </span>}
        {routine.title}
      </span>
      <span className="shrink-0 text-sm text-muted">{routineScheduleLabel(routine)}</span>

      <IconButton
        ref={anchor}
        label={menuLabel}
        onClick={() => {
          setOpen((value) => {
            if (!value) onOpenMenu?.();
            return !value;
          });
        }}
      >
        ⋯
      </IconButton>
      <Popover
        open={open}
        onClose={close}
        anchorRef={anchor}
        hasPopup="menu"
        placement="bottom-end"
        returnFocus={returnFocus}
      >
        <Menu label={menuLabel} items={items} onClose={close} />
      </Popover>
    </li>
  );
}
