'use client';

import { useId } from 'react';

import type { Category } from '@/domain/category/category';

import { CategoryBars } from '@/features/stats/components/CategoryBars';

import { cn } from '@/lib/cn';

type CategoryPanelSectionProps = {
  /** `CategoryBars` 와 같은 규약 — 툼스톤을 포함해 넘기면 삭제된 카테고리 이름까지 보인다. */
  categories: readonly Category[];
  className?: string;
};

/** 인사이트 패널의 "카테고리별" 섹션 (§2, R5). */
export function CategoryPanelSection({ categories, className }: CategoryPanelSectionProps) {
  const headingId = useId();

  return (
    <section
      aria-labelledby={headingId}
      className={cn('flex flex-col gap-[var(--space-3)]', className)}
    >
      <h2 id={headingId} className="text-md font-semibold text-text">
        카테고리별
      </h2>
      <CategoryBars categories={categories} />
    </section>
  );
}
