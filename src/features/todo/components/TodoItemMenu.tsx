'use client';

import { useRef, useState } from 'react';

import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';
import type { Todo } from '@/domain/todo/todo';

import { TODO_MESSAGES as M } from '@/features/todo/messages';

import { IconButton } from '@/components/ui/IconButton';
import { Menu } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';

/** `Menu` 의 항목 모양. 프리미티브가 타입을 export 하지 않아 여기서 같은 모양을 쓴다(구조적으로 검사된다). */
type MenuRow = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  destructive?: boolean;
};

type TodoItemMenuProps = {
  todo: Todo;
  /** 삭제된 카테고리의 투두 (R16) — 옮기기·삭제만 남는다. */
  readOnly: boolean;
  /** "다른 카테고리로 옮기기" 의 후보. 자기 카테고리는 호출부가 이미 뺀다. */
  moveTargets: readonly Category[];
  /** 완료 항목에서는 위로/아래로가 비활성이다 (R11). */
  canReorder: boolean;
  onEdit: () => void;
  onAddMemo: () => void;
  onTomorrow: () => void;
  onPickDate: () => void;
  onMove: (direction: -1 | 1) => void;
  onChangeCategory: (categoryId: CategoryId) => void;
  onDelete: () => void;
  /** 메뉴를 닫을 때 앵커가 이미 사라졌으면(삭제 직후) 대신 포커스할 곳 (app-shell R14). */
  returnFocus?: () => HTMLElement | null;
  /** 메뉴가 열릴 때. 호출부가 "이 행이 사라지면 어디로 갈지" 를 **미리** 찍어 두는 자리다. */
  onOpen?: () => void;
};

/**
 * 항목의 `⋯` 메뉴 (todo.md §2-A·R10·R11·R13·R16).
 *
 * "타이머 시작"(§2-A)은 두지 않았다 — 타이머는 T-23 소유라 누르면 아무 일도 없는 항목이 된다.
 * 카테고리 목록은 **2단계 메뉴**로 편다: 읽기 전용 그룹의 유일한 출구인데(R16) 활성 카테고리가
 * 최대 50개라 1단계에 펼치면 삭제가 스크롤 밖으로 밀린다.
 */
export function TodoItemMenu({
  todo,
  readOnly,
  moveTargets,
  canReorder,
  onEdit,
  onAddMemo,
  onTomorrow,
  onPickDate,
  onMove,
  onChangeCategory,
  onDelete,
  returnFocus,
  onOpen,
}: TodoItemMenuProps) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<'root' | 'category'>('root');
  // `Menu` 는 항목을 고르면 언제나 `onClose` 를 부른다 — 2단계로 펼치는 항목만 그 닫힘을 한 번 삼킨다.
  const keepOpen = useRef(false);

  const close = (): void => {
    if (keepOpen.current) {
      keepOpen.current = false;
      return;
    }
    setOpen(false);
    setView('root');
  };
  const run =
    (action: () => void): (() => void) =>
    () => {
      keepOpen.current = false;
      close();
      action();
    };

  const rootItems: MenuRow[] = readOnly
    ? [
        {
          id: 'move-category',
          label: M.menuMoveCategory,
          disabled: moveTargets.length === 0,
          onSelect: () => {
            keepOpen.current = true;
            setView('category');
          },
        },
        { id: 'delete', label: M.menuDelete, destructive: true, onSelect: run(onDelete) },
      ]
    : [
        { id: 'edit', label: M.menuEdit, onSelect: run(onEdit) },
        { id: 'memo', label: M.menuMemo, onSelect: run(onAddMemo) },
        { id: 'tomorrow', label: M.menuTomorrow, onSelect: run(onTomorrow) },
        { id: 'pick-date', label: M.menuPickDate, onSelect: run(onPickDate) },
        {
          id: 'up',
          label: M.menuUp,
          disabled: !canReorder,
          onSelect: run(() => onMove(-1)),
        },
        {
          id: 'down',
          label: M.menuDown,
          disabled: !canReorder,
          onSelect: run(() => onMove(1)),
        },
        { id: 'delete', label: M.menuDelete, destructive: true, onSelect: run(onDelete) },
      ];

  const categoryItems: MenuRow[] = moveTargets.map((category) => ({
    id: category.id,
    label: `${category.emoji ?? ''} ${category.name}`.trim(),
    onSelect: run(() => onChangeCategory(category.id)),
  }));

  return (
    <>
      <IconButton
        ref={anchor}
        label={M.menuLabel(todo.title)}
        onClick={() => {
          setView('root');
          setOpen((value) => {
            if (!value) onOpen?.();
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
        <Menu
          key={view}
          label={view === 'root' ? M.menuLabel(todo.title) : M.menuMoveCategory}
          items={view === 'root' ? rootItems : categoryItems}
          onClose={close}
        />
      </Popover>
    </>
  );
}
