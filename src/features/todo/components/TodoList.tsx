'use client';

import { useEffect, useState } from 'react';

import type { Category } from '@/domain/category/category';
import { activeCategories } from '@/domain/category/category.rules';
import type { DateKey } from '@/domain/date/date-key';
import type { TodoId } from '@/domain/ids';
import { isTombstone } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { ITEM_SHORTCUT_IDS, useDocumentedShortcuts, useShortcut } from '@/features/command';
import { TodoGroupSection } from '@/features/todo/components/TodoGroupSection';
import { useTodoActions } from '@/features/todo/hooks/useTodoActions';
import { useTodoCommands } from '@/features/todo/hooks/useTodoCommands';
import { useTodoDate } from '@/features/todo/hooks/useTodoDate';
import { useTodoGroups } from '@/features/todo/hooks/useTodoGroups';
import { TODO_MESSAGES as M } from '@/features/todo/messages';

import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { pushToast } from '@/components/ui/Toast';

import { fromDateKey } from '@/lib/date';

type PendingDelete = { todo: Todo; fallback: HTMLElement | null };

type TodoListProps = {
  /** 보고 있는 날짜. 이 컴포넌트가 그 날짜를 메모리에 올린다(R17) — 화면에 **한 번만** 마운트한다. */
  date: DateKey;
  /**
   * 카테고리 전량(툼스톤 포함 가능). 그룹 순서·이름·색의 출처다 — 이 컴포넌트는 카테고리 스토어를
   * 구독하지 않는다(feature 간 결합을 호출부 한 곳에 모은다, `useTodoGroups` 주석).
   */
  categories: readonly Category[];
};

/** "9월 18일" — 날짜 이동 토스트 문구 (R10). */
function dayLabel(date: DateKey): string {
  const at = fromDateKey(date);
  return `${at.getMonth() + 1}월 ${at.getDate()}일`;
}

/**
 * 선택 날짜의 투두 목록 (todo.md §2-A·§2-C·R15).
 *
 * 화면 전체가 아니라 **본문 컬럼**이다 — 사이드바·헤더·날짜 스트립을 붙이는 것은 셸(T-20)이다.
 * 토스트는 자기 뷰포트를 띄우지 않고 전역 허브에 밀어 넣는다(T-30, app-shell R8 "동시에 1개").
 */
export function TodoList({ date, categories }: TodoListProps) {
  const { status, error } = useTodoDate(date);
  const groups = useTodoGroups(categories);
  const { removeTodo, moveToDate, clearError } = useTodoActions();
  const [addOpenFor, setAddOpenFor] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: TodoId; field: 'title' | 'memo' } | null>(null);
  const [draggingId, setDraggingId] = useState<TodoId | null>(null);
  const [pending, setPending] = useState<PendingDelete | null>(null);
  const [announcement, setAnnouncement] = useState('');

  const active = activeCategories(categories.filter((category) => !isTombstone(category)));
  const known = new Map(categories.map((category) => [category.id, category]));

  // 항목 포커스 키(Space·Enter·Delete·Alt+↑/↓)를 도움말에 싣는다 — 처리는 각 행이 한다(T-17 R2).
  useDocumentedShortcuts(ITEM_SHORTCUT_IDS);
  useShortcut('todo.new', () => setAddOpenFor(active[0]?.id ?? null));
  // 팔레트의 `새 할 일 (<카테고리>)` (shortcuts R7). `N` 과 **같은 상태**를 연다 — 입력 행을 여는
  // 곳이 둘이 되면 한쪽만 고쳤을 때 조용히 갈린다. 목록이 사라지면 명령도 함께 사라진다.
  useTodoCommands(active, (categoryId) => setAddOpenFor(categoryId));

  const confirmDelete = async (): Promise<void> => {
    if (pending === null) return;
    const { todo, fallback } = pending;
    setPending(null);
    if (!(await removeTodo(todo.id))) return;
    if (editing?.id === todo.id) setEditing(null);
    pushToast({ message: M.deleted });
    // Dialog 가 앵커를 먼저 시도하고 사라졌을 때만 이 대상을 쓴다 — 여기서 한 번 더 확실히 한다.
    fallback?.focus();
  };

  const handleMovedToDate = (todo: Todo, to: DateKey): void => {
    pushToast({
      message: M.movedToDate(dayLabel(to)),
      action: { label: M.undo, onAction: () => void moveToDate(todo.id, todo.date) },
    });
  };

  // 목록은 멀쩡하고 마지막 **쓰기**만 실패한 경우를 토스트로 알린다(useTodoDate 주석의 두 갈래).
  // 파생 상태 동기화가 아니라 알림이라 effect 가 맞는 자리다 — 렌더 중에 하면 매 렌더 토스트가 는다.
  useEffect(() => {
    if (error === null || status === 'error') return;
    pushToast({ message: error, variant: 'error' });
    clearError();
  }, [error, status, clearError]);

  const handlers = {
    onEditChange: (id: TodoId | null, field: 'title' | 'memo' = 'title') =>
      setEditing(id === null ? null : { id, field }),
    onRequestDelete: (todo: Todo, returnFocus: () => HTMLElement | null) =>
      setPending({ todo, fallback: returnFocus() }),
    onAnnounce: setAnnouncement,
    onMovedToDate: handleMovedToDate,
  };

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {status === 'loading' ? <p className="text-sm text-muted">불러오는 중이에요</p> : null}
      {status === 'error' ? (
        <p role="alert" className="text-sm text-muted">
          {error}
        </p>
      ) : null}

      {groups.map((group) => {
        const category = known.get(group.categoryId);
        return (
          <TodoGroupSection
            key={group.categoryId}
            group={group}
            category={category}
            readOnly={category === undefined || isTombstone(category)}
            categories={active}
            addOpen={addOpenFor === group.categoryId}
            onAddOpenChange={(open) => setAddOpenFor(open ? group.categoryId : null)}
            editing={editing}
            draggingId={draggingId}
            onDragChange={setDraggingId}
            {...handlers}
          />
        );
      })}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>

      <ConfirmDialog
        open={pending !== null}
        title={pending === null ? '' : M.deleteTitle(pending.todo.title)}
        description={M.deleteDescription}
        onConfirm={() => void confirmDelete()}
        onCancel={() => setPending(null)}
        returnFocus={() => pending?.fallback ?? null}
      />
    </div>
  );
}
