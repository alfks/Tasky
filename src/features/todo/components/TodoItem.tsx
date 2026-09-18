'use client';

import { useId, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId, TodoId } from '@/domain/ids';
import type { Todo } from '@/domain/todo/todo';

import { TODO_DRAG_MIME } from '@/features/date-strip';
import { RoutineDialog } from '@/features/todo/components/RoutineDialog';
import { FLIP_ATTR } from '@/features/todo/components/todo-focus';
import { TodoEditPanel } from '@/features/todo/components/TodoEditPanel';
import { DatePickRow, DragHandle } from '@/features/todo/components/TodoItemControls';
import { TodoItemMenu } from '@/features/todo/components/TodoItemMenu';
import { useTodoItemActions } from '@/features/todo/components/useTodoItemActions';
import { TODO_MESSAGES as M } from '@/features/todo/messages';

import { Checkbox } from '@/components/ui/Checkbox';

import { cn } from '@/lib/cn';
import { addDays } from '@/lib/date';
import { isImeKey } from '@/lib/ime';

/** 행이 담당하는 바깥 동작. 개수가 많아 한 묶음으로 받는다(prop 이 흩어지면 호출부가 빠뜨린다). */
export type TodoItemHandlers = {
  /** 편집 패널을 여닫는다. `null` 이면 닫기. */
  onEditChange: (id: TodoId | null, field?: 'title' | 'memo') => void;
  /** 삭제 확인 대화상자를 여는 쪽 (R13) — 행은 절대 바로 지우지 않는다. */
  onRequestDelete: (todo: Todo, returnFocus: () => HTMLElement | null) => void;
  /** `aria-live` 낭독 (§5). */
  onAnnounce: (message: string) => void;
  /** 완료 토글이 끝났을 때. 이동 낭독 시점은 그룹이 R8 대기와 맞춰 잡는다. */
  onToggled: (done: boolean) => void;
  /** 날짜 이동 토스트 (R10). */
  onMovedToDate: (todo: Todo, date: DateKey) => void;
};

type TodoItemProps = TodoItemHandlers & {
  todo: Todo;
  /** 카테고리 색 — 체크 채움색(R9). 삭제된 카테고리면 없다. */
  color?: string;
  /** 삭제된 카테고리의 투두 (R16): 체크·편집·순서·드래그가 전부 막히고 옮기기·삭제만 남는다. */
  readOnly: boolean;
  /** 편집 패널·카테고리 이동의 선택지 — 활성 카테고리만 (R12). */
  categories: readonly Category[];
  /** `reorder` 의 좌표계 (R11). */
  sequence: readonly Todo[];
  editingField: 'title' | 'memo' | null;
  /** 드래그 중인 항목 id — 드롭 표시선을 그릴지 판단한다. */
  draggingId: TodoId | null;
  onDragChange: (id: TodoId | null) => void;
  onDropOn: (overId: TodoId, event: ReactDragEvent<HTMLElement>) => void;
};

/** 메모는 목록에서 첫 줄만 1줄로 줄여 보여 준다 (R2). */
function memoPreview(memo: string | undefined): string | null {
  const first = memo?.split('\n')[0]?.trim();
  return first === undefined || first === '' ? null : first;
}

export function TodoItem({
  todo,
  color,
  readOnly,
  categories,
  sequence,
  editingField,
  draggingId,
  onDragChange,
  onDropOn,
  onEditChange,
  onRequestDelete,
  onAnnounce,
  onToggled,
  onMovedToDate,
}: TodoItemProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  const titleRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const [pickingDate, setPickingDate] = useState(false);
  const [registeringRoutine, setRegisteringRoutine] = useState(false);
  const canReorder = !readOnly && !todo.done;

  const { toggle, move, goToDate, toCategory, closeEdit, returnFocus, snapshotFocus } =
    useTodoItemActions({
      todo,
      readOnly,
      canReorder,
      sequence,
      editingField,
      rowRef,
      titleRef,
      onEditChange,
      onAnnounce,
      onToggled,
      onMovedToDate,
    });

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLLIElement>): void => {
    // 행 자신이 포커스일 때만. 안쪽 입력·버튼에서 올라온 키까지 여기서 처리하면 편집 중 Space 가
    // 완료 토글이 되고 Backspace 가 삭제 확인을 연다.
    //
    // `isImeKey` 는 **지금은 닿지 않는** 방어선이다: 조합이 성립하려면 편집 가능한 요소가 포커스여야
    // 하는데, 그러면 위 `e.target !== e.currentTarget` 에서 이미 돌아선다. 행이 언젠가 인라인 편집을
    // 품게 되면 그때 필요해지므로 남긴다 — 빼면 그 변경이 조용히 R4 를 깬다.
    if (e.target !== e.currentTarget || isImeKey(e.nativeEvent)) return;
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      move(e.key === 'ArrowUp' ? -1 : 1);
    } else if (e.key === ' ') {
      e.preventDefault();
      toggle(!todo.done);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (!readOnly) onEditChange(todo.id, 'title');
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      onRequestDelete(todo, returnFocus);
    }
  };

  const handleDragStart = (e: ReactDragEvent<HTMLElement>): void => {
    e.dataTransfer.effectAllowed = 'move';
    // 날짜 스트립도 같은 MIME 으로 받는다(date-strip R13) — 그쪽에 드롭하면 날짜 이동이 된다(R10-d).
    e.dataTransfer.setData(TODO_DRAG_MIME, todo.id);
    if (rowRef.current !== null) e.dataTransfer.setDragImage(rowRef.current, 12, 12);
    onDragChange(todo.id);
  };

  // **순서 변경으로 받는 것은 같은 그룹의 드래그뿐이다** (R20). 다른 카테고리에서 온 드래그는 이
  // 행 위에 있어도 여기서 받지 않고 그대로 지나가 **그룹 섹션**이 받는다(= 카테고리 이동). 항목 위냐
  // 빈 자리냐로 제스처가 갈리면 같은 화면에서 같은 손짓이 두 가지 뜻이 된다 — 경계는 "같은
  // 카테고리인가" 하나다. 지나가게 두는 것으로 충분한 이유: `dragover` 는 전파 경로 어디서든
  // `preventDefault` 되면 드롭이 허용되고, 섹션이 그 자리에서 막아 준다.
  const sameGroup = draggingId !== null && sequence.some((item) => item.id === draggingId);
  const dropTarget = sameGroup && draggingId !== todo.id && canReorder;
  const memo = memoPreview(todo.memo);
  const minutes = Math.round((todo.focusSeconds ?? 0) / 60);

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- 행 자체가 포커스를 받는 것이 스펙이다(todo.md §5: 항목 행 tabindex=0 + Space/Enter/Delete/Alt+↑↓). 행 안에 버튼이 여럿이라 행을 button 으로 바꿀 수 없고, 모든 동작에 같은 일을 하는 시맨틱 버튼(체크박스·제목·⋯ 메뉴)이 함께 있다.
    <li
      ref={rowRef}
      {...{ [FLIP_ATTR]: todo.id }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onDragOver={dropTarget ? (e) => e.preventDefault() : undefined}
      onDrop={
        dropTarget
          ? (e) => {
              e.preventDefault();
              onDropOn(todo.id, e);
            }
          : undefined
      }
      className={cn(
        'flex flex-col gap-[var(--space-1)] rounded-[var(--radius-md)] px-[var(--space-2)] py-[var(--space-1)]',
        // 호버는 **앱에 이미 있는 언어 그대로** `--color-surface-2` 다(theme.md §3 표: "hover, 트랙,
        // 스켈레톤"). 본뜬 곳: `CategoryListItem.tsx`:95 · `Menu.tsx`:127 · `TodoAddRow.tsx`:126 —
        // 전부 `hover:bg-surface-2`. 행은 포커스를 받는 컨트롤이므로(todo.md §5, tabindex=0 +
        // Space/Enter/Delete/Alt+↑↓) 다른 클릭 대상과 같은 신호를 내야 한다.
        //
        // **터치에서 눌어붙지 않는다**: Tailwind 4 의 `hover:` 는 기본으로 `@media (hover:hover)` 안에
        // 들어간다(빌드 CSS 에서 확인 — `@media (hover:hover){.hover\:bg-surface-2:hover{…}}`).
        // 그래서 미디어 쿼리를 **따로 쓰지 않는다** — 손으로 한 겹 더 쓰면 그것이 곧 새 언어다.
        'hover:bg-surface-2',
        'transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        draggingId === todo.id && 'opacity-50',
      )}
      style={color === undefined ? undefined : { ['--cat-color' as string]: color }}
    >
      <div className="flex min-h-[var(--control-hit-min)] items-center gap-[var(--space-1)]">
        {canReorder ? (
          <DragHandle
            title={todo.title}
            onDragStart={handleDragStart}
            onDragEnd={() => onDragChange(null)}
            onMove={move}
          />
        ) : (
          <span aria-hidden="true" className="size-[var(--control-hit-min)] shrink-0" />
        )}

        <Checkbox
          checked={todo.done}
          disabled={readOnly}
          labelledBy={titleId}
          onCheckedChange={toggle}
        />

        <button
          ref={titleRef}
          id={titleId}
          type="button"
          disabled={readOnly}
          onClick={() => onEditChange(todo.id, 'title')}
          className={cn(
            'min-w-0 flex-1 truncate rounded-[var(--radius-sm)] bg-transparent px-[var(--space-1)] text-left text-base',
            // `readOnly` 면 `disabled` 라, 투명 배경 버튼의 기존 언어인 `Button.tsx`:27(ghost:
            // `bg-transparent text-text hover:enabled:bg-surface-2`)·`DateCell.tsx`:123 을 그대로 쓴다 —
            // `enabled:` 가 빠지면 누를 수 없는 제목이 눌리는 척한다.
            'hover:enabled:bg-surface-2',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            'transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
            todo.done ? 'text-muted line-through' : 'text-text',
          )}
        >
          {todo.title}
        </button>

        {memo === null ? null : (
          <span aria-label={M.hasMemo} role="img" className="shrink-0 text-xs text-muted">
            🗒
          </span>
        )}
        {minutes > 0 ? (
          <span
            aria-label={M.focusLabel(minutes)}
            className="shrink-0 rounded-[var(--radius-full)] bg-surface-2 px-[var(--space-2)] text-xs text-muted"
          >
            {M.focusChip(minutes)}
          </span>
        ) : null}

        <TodoItemMenu
          todo={todo}
          readOnly={readOnly}
          canReorder={canReorder}
          moveTargets={categories}
          returnFocus={returnFocus}
          onOpen={snapshotFocus}
          onEdit={() => onEditChange(todo.id, 'title')}
          onAddMemo={() => onEditChange(todo.id, 'memo')}
          onTomorrow={() => goToDate(addDays(todo.date, 1))}
          onPickDate={() => setPickingDate(true)}
          onMove={move}
          onChangeCategory={(id: CategoryId) => toCategory(id)}
          onRegisterRoutine={() => setRegisteringRoutine(true)}
          onDelete={() => onRequestDelete(todo, returnFocus)}
        />
      </div>

      {memo === null || editingField !== null ? null : (
        <p className="truncate pl-[var(--space-8)] text-sm text-muted">{memo}</p>
      )}

      {pickingDate ? (
        <DatePickRow
          date={todo.date}
          onPick={(next) => {
            setPickingDate(false);
            goToDate(next);
          }}
          onDismiss={() => setPickingDate(false)}
        />
      ) : null}

      {editingField === null ? null : (
        <TodoEditPanel
          todo={todo}
          categories={categories}
          autoFocusField={editingField}
          onClose={closeEdit}
          onDelete={() => onRequestDelete(todo, returnFocus)}
        />
      )}

      {registeringRoutine ? (
        <RoutineDialog
          todo={todo}
          categories={categories}
          onClose={() => setRegisteringRoutine(false)}
          returnFocus={returnFocus}
        />
      ) : null}
    </li>
  );
}
