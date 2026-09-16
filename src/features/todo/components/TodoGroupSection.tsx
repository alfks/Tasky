'use client';

import { useRef } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';

import type { Category } from '@/domain/category/category';
import type { TodoId } from '@/domain/ids';
import type { Todo } from '@/domain/todo/todo';

import { dropTargetIndex, isAfterMidpoint } from '@/features/todo/components/todo-drag';
import { LIST_FOCUS_ATTR } from '@/features/todo/components/todo-focus';
import type { BlockOrder } from '@/features/todo/components/todo-motion';
import { TodoAddRow } from '@/features/todo/components/TodoAddRow';
import { TodoItem, type TodoItemHandlers } from '@/features/todo/components/TodoItem';
import { useCompletionMotion } from '@/features/todo/components/useCompletionMotion';
import { useFlipRows } from '@/features/todo/components/useFlipRows';
import { useReducedMotion } from '@/features/todo/components/useReducedMotion';
import { useTodoActions } from '@/features/todo/hooks/useTodoActions';
import { TODO_MESSAGES as M } from '@/features/todo/messages';
import type { TodoGroup } from '@/features/todo/store/todo-selectors';

import { cn } from '@/lib/cn';

type TodoGroupSectionProps = Omit<TodoItemHandlers, 'onToggled'> & {
  group: TodoGroup;
  /** 카테고리 행. 삭제돼 더는 목록에 없으면 `undefined` (R15·R16). */
  category?: Category;
  /** 읽기 전용 그룹 (R16) — 삭제된 카테고리의 남은 완료 투두. */
  readOnly: boolean;
  /** 편집 패널·이동 메뉴의 선택지(활성 카테고리). */
  categories: readonly Category[];
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
  editing: { id: TodoId; field: 'title' | 'memo' } | null;
  /** 드래그 상태는 화면 하나에서만 하나다 — 그룹 사이를 오갈 때 표시선이 둘 남지 않게 위에서 쥔다. */
  draggingId: TodoId | null;
  onDragChange: (id: TodoId | null) => void;
};

/** 렌더 순서(id)를 실제 투두로. `sequence` 는 그룹 전체를 담고 있어 한 번만 훑으면 된다. */
function pick(order: readonly string[], byId: Map<string, Todo>): Todo[] {
  return order.flatMap((id) => {
    const todo = byId.get(id);
    return todo === undefined ? [] : [todo];
  });
}

/**
 * 카테고리 하나의 그룹 (todo.md §2-A·R7·R8·R11·R16).
 *
 * 미완료 블록 → 입력 행 → 구분선 → 완료 블록을 **하나의 `<ul>`** 에 담는다. 두 목록으로 쪼개면
 * 삭제 뒤 포커스를 옮길 "다음 형제" 가 블록 경계에서 끊기고(§5), FLIP 이 블록을 건너뛰는 이동을
 * 측정하지 못한다 — R8 의 이동이 바로 그 경계를 넘는 움직임이다.
 */
export function TodoGroupSection({
  group,
  category,
  readOnly,
  categories,
  addOpen,
  onAddOpenChange,
  editing,
  draggingId,
  onDragChange,
  onEditChange,
  onRequestDelete,
  onAnnounce,
  onMovedToDate,
}: TodoGroupSectionProps) {
  const { reorder } = useTodoActions();
  const listRef = useRef<HTMLUListElement>(null);
  const pendingAnnounce = useRef<string | null>(null);
  const reduced = useReducedMotion();

  const current: BlockOrder = {
    incomplete: group.incomplete.map((todo) => todo.id),
    completed: group.completed.map((todo) => todo.id),
  };
  const flush = (): void => {
    const message = pendingAnnounce.current;
    pendingAnnounce.current = null;
    if (message !== null) onAnnounce(message);
  };
  const { order } = useCompletionMotion(current, !reduced, flush);
  useFlipRows(listRef, !reduced);

  const byId = new Map(group.sequence.map((todo) => [todo.id, todo]));
  const incomplete = pick(order.incomplete, byId);
  const completed = pick(order.completed, byId);

  const handleToggled = (done: boolean): void => {
    pendingAnnounce.current = done ? M.movedDown : M.movedUp;
    // 대기가 없는 설정에서는 이동이 이미 끝났다 — 400ms 뒤에 말하면 화면과 어긋난다(R8).
    if (reduced) flush();
  };

  const handleDropOn = (overId: TodoId, event: ReactDragEvent<HTMLElement>): void => {
    if (draggingId === null) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const index = dropTargetIndex(
      group.sequence,
      draggingId,
      overId,
      isAfterMidpoint(rect, event.clientY),
    );
    onDragChange(null);
    if (index === null) return;
    void reorder(draggingId, index);
  };

  const itemProps = {
    categories,
    readOnly,
    sequence: group.sequence,
    color: category?.color,
    draggingId,
    onDragChange,
    onDropOn: handleDropOn,
    onEditChange,
    onRequestDelete,
    onAnnounce,
    onMovedToDate,
    onToggled: handleToggled,
  };
  const name = category?.name ?? M.deletedCategory;

  return (
    <section
      aria-label={name}
      className="flex flex-col gap-[var(--space-2)] rounded-[var(--radius-xl)] bg-surface p-[var(--space-3)]"
    >
      <div className="flex items-center gap-[var(--space-2)] px-[var(--space-2)]">
        <span
          aria-hidden="true"
          style={{ backgroundColor: category?.color ?? 'var(--color-faint)' }}
          className="inline-block size-[10px] shrink-0 rounded-full"
        />
        {category?.emoji === undefined ? null : <span aria-hidden="true">{category.emoji}</span>}
        <h2 className={cn('min-w-0 flex-1 truncate text-md font-semibold', 'text-text')}>{name}</h2>
        <span className="shrink-0 text-sm text-muted">
          {group.counts.done}/{group.counts.total}
        </span>
      </div>
      {readOnly ? <p className="px-[var(--space-2)] text-xs text-muted">{M.readOnlyHint}</p> : null}

      <ul
        ref={listRef}
        {...{ [LIST_FOCUS_ATTR]: name }}
        tabIndex={-1}
        className="relative flex list-none flex-col focus-visible:outline-none"
      >
        {incomplete.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            editingField={editing?.id === todo.id ? editing.field : null}
            {...itemProps}
          />
        ))}

        {readOnly ? null : (
          <li className="py-[var(--space-1)]">
            <TodoAddRow
              categoryId={group.categoryId}
              categoryName={name}
              open={addOpen}
              onOpenChange={onAddOpenChange}
            />
          </li>
        )}

        {completed.length === 0 ? null : (
          <li className="flex items-center gap-[var(--space-2)] py-[var(--space-2)]">
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
            <h3 className="shrink-0 text-xs text-muted">{M.doneDivider(completed.length)}</h3>
            <span aria-hidden="true" className="h-px flex-1 bg-border" />
          </li>
        )}

        {completed.map((todo) => (
          <TodoItem
            key={todo.id}
            todo={todo}
            editingField={editing?.id === todo.id ? editing.field : null}
            {...itemProps}
          />
        ))}
      </ul>

      {group.sequence.length === 0 ? (
        <p className="px-[var(--space-2)] text-sm text-muted">{M.empty}</p>
      ) : null}
    </section>
  );
}
