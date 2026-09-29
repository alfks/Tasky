'use client';

// 루틴 관리 화면의 행 한 줄 (routine.md §2·R7·R7-a·R10·R13). category.md §2-A `CategoryListItem` 의
// 손잡이 + 행 + `⋯` 메뉴 구조를 그대로 본떴다 — 새 UI 문법을 만들지 않는다.
//
// **`⋯` 메뉴가 행마다 다르다(R7-a)**: 종료일이 있는 루틴(기록)은 중지·재개 항목 자체가 없다
// (회색 비활성이 아니라 항목이 아예 메뉴에 없음) — `R3`가 등록 즉시 끝까지 채워서 지연 생성이
// 없고, 중지해도 멈출 것이 없기 때문이다.
//
// **순서 변경(R13)은 손잡이에서만 시작한다** — 드래그(`DragHandle`)와 `Alt+↑/↓` 둘 다 그 자리다.
// 종료일 있는 기록도 목록의 일부라 같이 움직인다(단순함 우선).
import { useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';

import type { Category } from '@/domain/category/category';
import type { RoutineId } from '@/domain/ids';
import type { Routine } from '@/domain/routine/routine';

import { ROUTINE_DRAG_MIME } from '@/features/todo/components/routine-drag';
import { routineScheduleLabel } from '@/features/todo/components/routine-schedule-label';

import { DragHandle } from '@/components/ui/DragHandle';
import { IconButton } from '@/components/ui/IconButton';
import { Menu } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';

import { cn } from '@/lib/cn';

/** `Menu` 의 항목 모양 — 프리미티브가 타입을 export 하지 않아 구조적으로 맞춘다(TodoItemMenu 와 같은 방식). */
type MenuRow = { id: string; label: string; onSelect: () => void; destructive?: boolean };

/** 드래그 순서 변경 배선 (R13). 목표 인덱스 계산과 저장은 목록(`RoutineManagerDialog`)이 한다. */
export type RoutineDragProps = {
  /** 지금 끌고 있는 루틴. `null` 이면 드래그 중이 아니다. */
  draggingId: RoutineId | null;
  onDragChange: (id: RoutineId | null) => void;
  onDropOn: (overId: RoutineId, event: ReactDragEvent<HTMLElement>) => void;
};

type RoutineManagerRowProps = {
  routine: Routine;
  /** 이 루틴이 가리키는 카테고리. 삭제됐으면 `undefined`(routine.md R11) — 점을 그리지 않는다. */
  category: Category | undefined;
  onPause: () => void;
  onResume: () => void;
  onRemove: () => void;
  /** `Alt+↑/↓`(R13). 목록이 실제 인덱스로 바꿔 저장하고 낭독한다. */
  onMove: (direction: -1 | 1) => void;
  drag: RoutineDragProps;
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
  onMove,
  drag,
  onOpenMenu,
  returnFocus,
}: RoutineManagerRowProps) {
  const rowRef = useRef<HTMLLIElement>(null);
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

  const handleDragStart = (e: ReactDragEvent<HTMLElement>): void => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(ROUTINE_DRAG_MIME, routine.id);
    // 손잡이만 끌려다니면 무엇을 옮기는지 안 보인다 — 행 전체를 끌고 다니는 그림으로 바꾼다.
    if (rowRef.current !== null) e.dataTransfer.setDragImage(rowRef.current, 12, 12);
    drag.onDragChange(routine.id);
  };

  // 자기 자신 위에는 놓을 수 없다(좌표가 그대로다). 다른 종류의 드래그(투두·카테고리)는 `draggingId`
  // 가 `null` 이라 여기까지 오지 않는다 — MIME 을 따로 읽지 않아도 갈린다.
  const dropTarget = drag.draggingId !== null && drag.draggingId !== routine.id;

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- 드롭 대상은 **행 전체**다(`CategoryListItem` 과 같은 이유). 드래그는 마우스 전용 제스처라 이 핸들러가 키보드 경로를 만들지 않는다 — 같은 일을 하는 `Alt+↑/↓` 가 손잡이에 있다.
    <li
      ref={rowRef}
      onDragOver={dropTarget ? (e) => e.preventDefault() : undefined}
      onDrop={
        dropTarget
          ? (e) => {
              e.preventDefault();
              drag.onDropOn(routine.id, e);
            }
          : undefined
      }
      className={cn(
        // 행 전체가 한 덩어리로 반응한다(theme R29) — 카테고리 사이드바 행과 같은 언어.
        'group flex items-center gap-[var(--space-1)] rounded-[var(--radius-md)] pr-[var(--space-1)]',
        'hover:bg-surface-3',
        'transition-[background-color,opacity] duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
        drag.draggingId === routine.id && 'opacity-50',
      )}
    >
      <DragHandle
        item={routine.title}
        className="group-hover:text-text hover:bg-transparent"
        onDragStart={handleDragStart}
        onDragEnd={() => drag.onDragChange(null)}
        onMove={onMove}
      />
      {category === undefined ? null : (
        <span
          aria-hidden="true"
          style={{ backgroundColor: category.color }}
          className="inline-block size-[12px] shrink-0 rounded-full"
        />
      )}
      <span className="min-w-0 flex-1 truncate py-[var(--space-1)] text-base text-text">
        {category?.emoji === undefined ? null : <span aria-hidden="true">{category.emoji} </span>}
        {routine.title}
      </span>
      <span className="shrink-0 text-sm text-muted group-hover:text-text">
        {routineScheduleLabel(routine)}
      </span>

      <IconButton
        ref={anchor}
        label={menuLabel}
        className="hover:enabled:bg-transparent"
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
