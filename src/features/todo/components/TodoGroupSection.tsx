'use client';

import { useId, useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent } from 'react';

import type { Category } from '@/domain/category/category';
import type { CategoryId, TodoId } from '@/domain/ids';
import { isTombstone } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { TODO_DRAG_MIME } from '@/features/date-strip';
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

import { IconButton } from '@/components/ui/IconButton';

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
  /**
   * 끌고 있는 투두가 **어느 카테고리에서 출발했는가** (R20). 끌고 있지 않으면 `null`.
   * 그룹은 이 값 하나로 "내 것(순서 변경)" 과 "남의 것(카테고리 이동)" 을 가른다.
   */
  draggingFrom: CategoryId | null;
  /** 다른 카테고리의 투두를 이 그룹에 떨어뜨렸다 (R20). 옮기기와 되돌리기 토스트는 호출부가 한다. */
  onDropToCategory: (todoId: string, categoryId: CategoryId) => void;
  /** 이 그룹이 접혀 있는가 (R22). 기본은 펼침 — 상태는 `TodoList` 가 카테고리별로 쥐고 있다. */
  collapsed: boolean;
  onToggleCollapse: () => void;
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
  draggingFrom,
  onDropToCategory,
  collapsed,
  onToggleCollapse,
  onEditChange,
  onRequestDelete,
  onAnnounce,
  onMovedToDate,
}: TodoGroupSectionProps) {
  const { reorder } = useTodoActions();
  const listRef = useRef<HTMLUListElement>(null);
  const [dropping, setDropping] = useState(false);
  const pendingAnnounce = useRef<string | null>(null);
  const reduced = useReducedMotion();
  const listId = useId();

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

  /**
   * 이 그룹이 지금의 드래그를 **카테고리 이동으로** 받는가 (R20).
   *
   * 두 가지를 본다. (1) 남의 그룹에서 왔는가 — 자기 그룹 드래그는 지금까지처럼 순서 변경이다.
   * (2) 이 그룹이 **활성 카테고리**인가 — 판단 근거는 `categories` 다. 이 목록이 곧 메뉴
   * `다른 카테고리로 옮기기` 의 선택지(R12)라, 드롭이 메뉴보다 더 많은 곳으로 옮길 수 있으면 같은
   * 일에 규칙이 둘이 된다. 종료된 카테고리·삭제된 카테고리(R16 읽기 전용 그룹)가 이 조건에서
   * 함께 걸러진다.
   */
  const accepts =
    draggingFrom !== null &&
    draggingFrom !== group.categoryId &&
    categories.some((item) => item.id === group.categoryId);

  const handleDragOver = (event: ReactDragEvent<HTMLElement>): void => {
    if (!accepts) return;
    // 기본 동작을 막아야 드롭이 허용된다. 안쪽 행에서 올라온 `dragover` 도 여기서 막히므로
    // 헤더·빈 자리·행 위 어디에 떨어뜨려도 같은 결과가 된다.
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDropping(true);
  };

  const handleDragLeave = (event: ReactDragEvent<HTMLElement>): void => {
    // 안쪽 행으로 들어갈 때도 섹션에 `dragleave` 가 온다(대상이 자식으로 바뀌므로). 그때까지
    // 표시를 끄면 점선이 깜빡인다 — 커서가 아직 섹션 안이면 켜 둔다.
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    setDropping(false);
  };

  const handleDrop = (event: ReactDragEvent<HTMLElement>): void => {
    if (!accepts) return;
    event.preventDefault();
    setDropping(false);
    onDragChange(null);
    // 페이로드는 날짜 스트립과 **같은 MIME** 이다(date-strip R13) — 드래그 소스가 하나라 형식도 하나다.
    const todoId = event.dataTransfer.getData(TODO_DRAG_MIME);
    if (todoId !== '') onDropToCategory(todoId, group.categoryId);
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
  // 지워진 카테고리라도 이름·색을 찾았으면(category R22 로 가리지 않은 한, ADR-0014) 그대로 쓴다
  // — `M.deletedCategory` 는 tombstone 조회마저 실패했을 때의 최후 폴백이다.
  const name =
    category === undefined
      ? M.deletedCategory
      : isTombstone(category)
        ? M.deletedCategoryName(category.name)
        : category.name;

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- 드롭을 받는 것은 **영역**이다(R20): 그룹 어디에 떨어뜨려도 같은 결과여야 해서 헤더·빈 자리·행을 모두 덮는 이 `section` 말고는 걸 자리가 없다. 여기 붙는 것은 마우스·키보드 리스너가 아니라 드래그 전용(`dragover`·`dragleave`·`drop`)이고, 같은 일을 하는 시맨틱 경로가 따로 있다 — 항목 메뉴 `다른 카테고리로 옮기기`·편집 패널의 카테고리 선택(WCAG 2.5.7, todo.md §5).
    <section
      aria-label={name}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      /*
       * **상시 카드의 면**(app-shell.md §2-A "면과 고도" — 값의 단일 소스는 그 절이다).
       * `bg-surface` 하나만으로는 캔버스(`--color-bg`)와 명도비 1.042:1(다크 1.084:1)이라 경계가
       * 사실상 없었다. 그래서 세 신호를 함께 건다: 1px 보더(다크에서 그림자가 거의 안 보이는 것을
       * 보완한다) + `--elev-sm`(`shadow-sm`, 라이트에서 부유감을 만든다) + `--radius-xl`.
       */
      className={cn(
        // 카드 안쪽 여백·헤더-목록 간격은 좁은 화면에서 --todo-section-pad·--todo-section-gap 으로
        // 줄어든다(theme.md §3-D R32). 데스크탑 값은 각각 --space-3·--space-2 와 같아 변화가 없다.
        'flex flex-col gap-[var(--todo-section-gap)] rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--todo-section-pad)] shadow-sm',
        // 받을 수 있다는 표시는 **이미 앱에 있는 언어**다: `DateCell` 이 투두를 받을 때 쓰는 점선
        // (`border-2 border-dashed border-accent`, date-strip R13) 그대로다. 같은 드래그가 두 곳에
        // 떨어질 수 있는데 표시가 서로 다르면 사용자는 둘을 다른 기능으로 읽는다.
        dropping && 'border-2 border-dashed border-accent',
      )}
    >
      <div className="flex items-center gap-[var(--space-2)] px-[var(--space-2)]">
        <IconButton
          aria-expanded={!collapsed}
          aria-controls={listId}
          onClick={onToggleCollapse}
          label={collapsed ? M.expandGroup(name) : M.collapseGroup(name)}
          className="text-muted"
        >
          {collapsed ? '▸' : '▾'}
        </IconButton>
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

      {collapsed ? null : (
        <>
          {readOnly ? (
            <p className="px-[var(--space-2)] text-xs text-muted">{M.readOnlyHint}</p>
          ) : null}

          <ul
            ref={listRef}
            id={listId}
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
        </>
      )}
    </section>
  );
}
