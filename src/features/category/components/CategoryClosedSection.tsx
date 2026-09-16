'use client';

import { useState } from 'react';

import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';

import { CategoryListItem } from '@/features/category/components/CategoryListItem';

/** 종료된 카테고리 섹션의 props — 행 동작은 그대로 `CategoryListItem` 에 넘긴다. */
type CategoryClosedSectionProps = {
  categories: readonly Category[];
  onSelect?: (id: CategoryId) => void;
  onEdit: (category: Category) => void;
  onRemove?: (category: Category) => void;
  onAnnounce: (message: string) => void;
};

/**
 * "종료됨 (n)" 접힘 섹션 (category R8). 기본은 접힘이고 `aria-expanded` 로 상태를 알린다.
 * 종료된 카테고리가 없으면 섹션 자체가 없다 — 빈 제목만 남으면 사이드바가 시끄럽다.
 */
export function CategoryClosedSection({
  categories,
  onSelect,
  onEdit,
  onRemove,
  onAnnounce,
}: CategoryClosedSectionProps) {
  const [expanded, setExpanded] = useState(false);

  if (categories.length === 0) {
    return null;
  }

  return (
    <section className="mt-[var(--space-3)]">
      <h3>
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
          className="flex h-[var(--control-hit-min)] w-full items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-2)] text-left text-sm text-muted hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          <span aria-hidden="true">{expanded ? '▾' : '▸'}</span>
          종료됨 ({categories.length})
        </button>
      </h3>
      {expanded ? (
        <ul className="mt-[var(--space-1)] flex flex-col gap-[var(--space-1)]">
          {categories.map((category) => (
            <CategoryListItem
              key={category.id}
              category={category}
              onSelect={onSelect}
              onEdit={onEdit}
              onRemove={onRemove}
              onAnnounce={onAnnounce}
            />
          ))}
        </ul>
      ) : null}
    </section>
  );
}
