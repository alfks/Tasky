'use client';

import { useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { Category, CategoryStatus } from '@/domain/category/category';
import { activeCategories } from '@/domain/category/category.rules';
import type { CategoryId } from '@/domain/ids';

import { useCategoryActions } from '@/features/category/hooks/useCategoryActions';
import { useCategoryStore } from '@/features/category/store/category-store';
import { useTodoGroup } from '@/features/todo';

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
};

/**
 * 사이드바의 카테고리 한 행 (category §2-A, R5·R8·R9·R19).
 *
 * 행 본체와 `⋯` 는 **각각 버튼**이다(`div onClick` 금지). 순서 변경은 `Alt+↑/↓` 로 하고 결과를
 * 낭독한다 — 마우스 드래그만으로 되는 기능을 두지 않는다(code-style §10).
 */
export function CategoryListItem({
  category,
  onSelect,
  onEdit,
  onRemove,
  onAnnounce,
}: CategoryListItemProps) {
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
    onAnnounce(`${category.name} 을(를) ${index + 1}번째로 옮겼어요`);
  };

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
    <li className="flex items-center gap-[var(--space-1)]">
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
          'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
          closed && 'text-muted',
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
          <span className="shrink-0 text-sm text-muted">
            {counts.done}/{counts.total}
          </span>
        ) : null}
      </button>

      <IconButton
        ref={menuAnchor}
        label={`${category.name} 메뉴`}
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
