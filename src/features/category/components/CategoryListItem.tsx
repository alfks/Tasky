'use client';

import { useRef, useState } from 'react';
import type { DragEvent as ReactDragEvent, KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { Category, CategoryStatus } from '@/domain/category/category';
import { activeCategories } from '@/domain/category/category.rules';
import type { CategoryId } from '@/domain/ids';

import {
  CATEGORY_DRAG_MIME,
  movedAnnouncement,
} from '@/features/category/components/category-drag';
import { useCategoryActions } from '@/features/category/hooks/useCategoryActions';
import { useCategoryStore } from '@/features/category/store/category-store';
import { useTodoGroup } from '@/features/todo';

import { DragHandle } from '@/components/ui/DragHandle';
import { IconButton } from '@/components/ui/IconButton';
import { Menu } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';

import { cn } from '@/lib/cn';
import { isImeKey } from '@/lib/ime';

/** 종료 상태의 배지 — 색이 아니라 기호 + 텍스트로 알린다 (category §5). */
const CLOSED_BADGE: Record<Exclude<CategoryStatus, 'active'>, string> = {
  completed: '✓ 완료',
  paused: '⏸ 중단',
};

/**
 * 드래그 순서 변경 배선 (R5). **활성 행에만 준다** — 종료된 카테고리는 `order` 좌표가 없어서
 * (R8·R9) 끌 자리도 놓을 자리도 없다. 주지 않으면 손잡이 자리에 같은 크기의 빈 칸이 들어가
 * 활성 목록과 종료 목록의 세로선이 어긋나지 않는다.
 */
export type CategoryDragProps = {
  /** 지금 끌고 있는 카테고리. `null` 이면 드래그 중이 아니다. */
  draggingId: CategoryId | null;
  onDragChange: (id: CategoryId | null) => void;
  /** 이 행 위에 놓였다. 목표 인덱스 계산과 저장은 목록(`CategoryList`)이 한다. */
  onDropOn: (overId: CategoryId, event: ReactDragEvent<HTMLElement>) => void;
};

type CategoryListItemProps = {
  category: Category;
  /** 행 본체를 눌렀을 때. 본문 그룹으로 스크롤·하이라이트하는 것은 셸(T-20)이 넘긴다. */
  onSelect?: (id: CategoryId) => void;
  /** 수정 다이얼로그를 여는 쪽. */
  onEdit: (category: Category) => void;
  /**
   * 삭제 대화상자를 여는 쪽 (category R10~R16 = T-12b). **주지 않으면 메뉴에 "삭제" 가 없다** —
   * 누르면 아무 일도 없는 항목을 두는 것보다 낫다. T-12b 가 이 prop 을 채우면 항목이 생긴다.
   */
  onRemove?: (category: Category) => void;
  /** 순서가 바뀐 결과를 낭독시킬 때 (R5 드래그 대안의 짝). */
  onAnnounce: (message: string) => void;
  /** 드래그 순서 변경. 활성 행만 받는다 — 위 `CategoryDragProps` 주석 참고. */
  drag?: CategoryDragProps;
};

/**
 * 사이드바의 카테고리 한 행 (category §2-A, R5·R8·R9·R19).
 *
 * 행 본체와 `⋯` 는 **각각 버튼**이다(`div onClick` 금지). 순서 변경은 손잡이(`⠿`) 드래그와
 * `Alt+↑/↓` 둘 다로 되고 결과를 낭독한다 — 마우스 드래그만으로 되는 기능을 두지 않는다
 * (code-style §10). `Alt+↑/↓` 는 손잡이와 행 본체 **양쪽**에서 듣는다: 손잡이는 마우스 사용자가
 * 잡는 자리와 같은 자리를 키보드에도 주고(WCAG 2.5.7), 행 본체는 탭 순서상 먼저 닿는 자리다.
 */
export function CategoryListItem({
  category,
  onSelect,
  onEdit,
  onRemove,
  onAnnounce,
  drag,
}: CategoryListItemProps) {
  const rowRef = useRef<HTMLLIElement>(null);
  const menuAnchor = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { setStatus, moveBy } = useCategoryActions();
  const { counts } = useTodoGroup(category.id);
  const badge = category.status === 'active' ? null : CLOSED_BADGE[category.status];
  const closed = badge !== null;

  const move = async (direction: -1 | 1): Promise<void> => {
    if (!(await moveBy(category.id, direction))) {
      return;
    }
    const order = activeCategories(Object.values(useCategoryStore.getState().byId));
    const index = order.findIndex((c) => c.id === category.id);
    onAnnounce(movedAnnouncement(category.name, index));
  };

  const handleDragStart = (e: ReactDragEvent<HTMLElement>): void => {
    if (drag === undefined) return;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData(CATEGORY_DRAG_MIME, category.id);
    // 손잡이만 끌려다니면 무엇을 옮기는지 안 보인다 — 행 전체를 끌고 다니는 그림으로 바꾼다.
    if (rowRef.current !== null) e.dataTransfer.setDragImage(rowRef.current, 12, 12);
    drag.onDragChange(category.id);
  };

  // 자기 자신 위에는 놓을 수 없다(좌표가 그대로다). 다른 종류의 드래그(투두)는 `draggingId` 가
  // `null` 이라 여기까지 오지 않는다 — MIME 을 따로 읽지 않아도 갈린다.
  const dropTarget =
    drag !== undefined && drag.draggingId !== null && drag.draggingId !== category.id;

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>): void => {
    if (isImeKey(e.nativeEvent) || !e.altKey) {
      return;
    }
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') {
      return;
    }
    e.preventDefault();
    void move(e.key === 'ArrowUp' ? -1 : 1);
  };

  return (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- 드롭 대상은 **행 전체**다. 안쪽 버튼(본체·손잡이·⋯)에 옮기면 ⋯ 위가 죽은 자리가 되고, 중간점 판정(`isAfterMidpoint`)도 행이 아니라 그 버튼 높이로 재게 된다. 드래그는 마우스 전용 제스처라 이 핸들러가 키보드 경로를 만들지 않는다 — 같은 일을 하는 `Alt+↑/↓` 가 손잡이와 행 본체 양쪽에 따로 있다.
    <li
      ref={rowRef}
      onDragOver={dropTarget ? (e) => e.preventDefault() : undefined}
      onDrop={
        dropTarget
          ? (e) => {
              e.preventDefault();
              drag?.onDropOn(category.id, e);
            }
          : undefined
      }
      className={cn(
        // `group` 은 R29 의 "행 전체가 한 덩어리로 반응한다" 를 세우는 축이다 — 배경과 글자색이
        // 따로 놀면 대비 계산(4.11 → 11.62)이 깨진다.
        'group flex items-center gap-[var(--space-1)] rounded-[var(--radius-md)]',
        'hover:bg-surface-3',
        'transition-[background-color,opacity] duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
        drag?.draggingId === category.id && 'opacity-50',
      )}
    >
      {drag === undefined ? (
        <span aria-hidden="true" className="size-[var(--control-hit-min)] shrink-0" />
      ) : (
        <DragHandle
          item={category.name}
          className="group-hover:text-text hover:bg-transparent"
          onDragStart={handleDragStart}
          onDragEnd={() => drag.onDragChange(null)}
          onMove={(direction) => void move(direction)}
        />
      )}

      <button
        type="button"
        onClick={() => onSelect?.(category.id)}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenuOpen(true);
        }}
        onKeyDown={handleKeyDown}
        className={cn(
          'flex h-[var(--control-height)] min-w-0 flex-1 items-center gap-[var(--space-2)]',
          'rounded-[var(--radius-md)] px-[var(--space-2)] text-left text-base text-text',
          // 배경은 행(`li`)이 칠한다(R29) — 본체만 칠하면 손잡이·`⋯` 칸이 빠진 반쪽 띠가 된다.
          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          closed && 'text-muted group-hover:text-text',
        )}
      >
        <span
          aria-hidden="true"
          style={{ backgroundColor: category.color }}
          className={cn('inline-block size-[12px] shrink-0 rounded-full', closed && 'opacity-60')}
        />
        {category.emoji === undefined ? null : <span aria-hidden="true">{category.emoji}</span>}
        <span className="min-w-0 flex-1 truncate">{category.name}</span>
        {badge === null ? null : <span className="shrink-0 text-sm">{badge}</span>}
        {counts.total > 0 ? (
          <span className="shrink-0 text-sm text-muted group-hover:text-text">
            {counts.done}/{counts.total}
          </span>
        ) : null}
      </button>

      <IconButton
        ref={menuAnchor}
        label={`${category.name} 메뉴`}
        className="hover:enabled:bg-transparent"
        onClick={() => setMenuOpen((open) => !open)}
      >
        ⋯
      </IconButton>
      <Popover
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={menuAnchor}
        hasPopup="menu"
        placement="bottom-end"
      >
        <Menu
          label={`${category.name} 메뉴`}
          onClose={() => setMenuOpen(false)}
          items={[
            ...(closed
              ? [
                  {
                    id: 'resume',
                    label: '재개',
                    onSelect: () => void setStatus(category.id, 'active'),
                  },
                  {
                    id: 'switch',
                    label: category.status === 'completed' ? '중단으로 바꾸기' : '완료로 바꾸기',
                    onSelect: () =>
                      void setStatus(
                        category.id,
                        category.status === 'completed' ? 'paused' : 'completed',
                      ),
                  },
                ]
              : [
                  { id: 'edit', label: '수정', onSelect: () => onEdit(category) },
                  {
                    id: 'complete',
                    label: '완료로 종료',
                    onSelect: () => void setStatus(category.id, 'completed'),
                  },
                  {
                    id: 'pause',
                    label: '중단으로 종료',
                    onSelect: () => void setStatus(category.id, 'paused'),
                  },
                ]),
            ...(onRemove === undefined
              ? []
              : [
                  {
                    id: 'remove',
                    label: '삭제',
                    destructive: true,
                    onSelect: () => onRemove(category),
                  },
                ]),
          ]}
        />
      </Popover>
    </li>
  );
}
