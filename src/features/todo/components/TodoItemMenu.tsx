'use client';

import { useRef, useState, type RefObject } from 'react';

import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';
import type { Todo } from '@/domain/todo/todo';

import { TODO_MESSAGES as M } from '@/features/todo/messages';

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
  /**
   * "다른 카테고리로 옮기기" 의 후보 = 활성 카테고리 전부. 자기 카테고리를 따로 빼지 않는다 —
   * 이 항목은 `readOnly` 분기에만 있고(R16), 그 투두의 카테고리는 삭제된 것이라 애초에 활성
   * 목록에 없다. 빼는 코드를 두면 아무 일도 하지 않으면서 "걸러진다" 는 인상만 남는다.
   */
  moveTargets: readonly Category[];
  onEdit: () => void;
  onAddMemo: () => void;
  /**
   * 이 투두로 집중 타이머를 시작한다(timer.md §2, 사용자 결정). 셸이 두 feature 를 잇는 자리에서
   * 내려주는 콜백이라(`todo` 는 `timer` 를 import 할 수 없다 — `timer` 가 이미 `Todo.focusSeconds`
   * 갱신 때문에 `todo` 를 참조해 순환이 된다) 없을 수 있다 — 그때는 항목을 숫제 그리지 않는다.
   */
  onStartTimer?: () => void;
  onTomorrow: () => void;
  onToday: () => void;
  today: string;
  onPickDate: () => void;
  onChangeCategory: (categoryId: CategoryId) => void;
  onRegisterRoutine: () => void;
  onDelete: () => void;
  /** 메뉴를 닫을 때 앵커가 이미 사라졌으면(삭제 직후) 대신 포커스할 곳 (app-shell R14). */
  returnFocus?: () => HTMLElement | null;
  /** 항목의 제목 버튼이 메뉴와 날짜 피커의 공통 앵커다. */
  triggerRef: RefObject<HTMLButtonElement | null>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/**
 * 항목을 누르면 열리는 메뉴 (todo.md §2-A·R10·R13·R16).
 *
 * "위로"·"아래로"는 여기 두지 않는다(사용자 결정) — 순서 변경의 키보드 대안은 드래그 손잡이·행
 * 포커스의 `Alt+↑/↓`(WCAG 2.5.7)로 이미 있어, 메뉴 항목은 세 번째 중복 경로였다.
 * 카테고리 목록은 **2단계 메뉴**로 편다: 읽기 전용 그룹의 유일한 출구인데(R16) 활성 카테고리가
 * 최대 50개라 1단계에 펼치면 삭제가 스크롤 밖으로 밀린다.
 */
export function TodoItemMenu({
  todo,
  readOnly,
  moveTargets,
  onEdit,
  onAddMemo,
  onStartTimer,
  onTomorrow,
  onToday,
  today,
  onPickDate,
  onChangeCategory,
  onRegisterRoutine,
  onDelete,
  returnFocus,
  triggerRef,
  open,
  onOpenChange,
}: TodoItemMenuProps) {
  const anchor = triggerRef;
  const setOpen = onOpenChange;
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
        // 완료한 일에 다시 집중을 걸 일은 없다 — TimerSetup 의 "미완료만" 필터(timer.md §2)와
        // 같은 판단이다. 콜백 자체가 없으면(위 prop 주석) 항목을 아예 만들지 않는다.
        ...(onStartTimer === undefined
          ? []
          : [
              { id: 'timer', label: M.menuTimer, disabled: todo.done, onSelect: run(onStartTimer) },
            ]),
        { id: 'tomorrow', label: M.menuTomorrow, onSelect: run(onTomorrow) },
        ...(todo.date === today
          ? []
          : [{ id: 'today', label: M.menuToday, onSelect: run(onToday) }]),
        { id: 'pick-date', label: M.menuPickDate, onSelect: run(onPickDate) },
        { id: 'routine', label: M.menuRoutine, onSelect: run(onRegisterRoutine) },
        { id: 'delete', label: M.menuDelete, destructive: true, onSelect: run(onDelete) },
      ];

  const categoryItems: MenuRow[] = moveTargets.map((category) => ({
    id: category.id,
    label: `${category.emoji ?? ''} ${category.name}`.trim(),
    onSelect: run(() => onChangeCategory(category.id)),
  }));

  return (
    <>
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
          dense
        />
      </Popover>
    </>
  );
}
