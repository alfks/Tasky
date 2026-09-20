'use client';

import type { CSSProperties } from 'react';

import type { Category } from '@/domain/category/category';
import type { CategoryCompletion } from '@/domain/todo/completion-rate';

import { categoryBarViewValueText, toCategoryBarView } from '@/features/reports/lib/category-view';
import type { CategoryBarView } from '@/features/reports/lib/category-view';

import { cn } from '@/lib/cn';

/** 카테고리 색은 CSS 변수로만 흘린다(code-style §3). completion-rate.md R5 와 같은 `progressbar` 패턴. */
type CategoryBarStyle = CSSProperties & Partial<Record<'--cat-color', string>>;

type CategoryRatioCardProps = {
  counts: readonly CategoryCompletion[];
  categories: readonly Category[];
};

/**
 * 카테고리별 비율(stats.md R3). `summarizeByCategory` 결과를 그대로 받아 그린다 — 집계는 여기서
 * 다시 하지 않는다. 막대는 completion-rate.md R5 의 `role="progressbar"` 패턴을 그대로 재사용한다.
 */
export function CategoryRatioCard({ counts, categories }: CategoryRatioCardProps) {
  const bars = toCategoryBarView(counts, categories);

  if (bars.length === 0) {
    return <p className="text-sm text-muted">이 기간에 기록이 없어요</p>;
  }

  return (
    <ul className="flex flex-col gap-[var(--space-2)]">
      {bars.map((bar) => (
        <li key={bar.categoryId}>
          <CategoryBarRow bar={bar} />
        </li>
      ))}
    </ul>
  );
}

function CategoryBarRow({ bar }: { bar: CategoryBarView }) {
  const style: CategoryBarStyle = { '--cat-color': bar.color };

  return (
    <div
      style={style}
      className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] items-center gap-[var(--space-2)]"
    >
      <span className="truncate text-base text-text">
        {bar.emoji !== undefined && <span aria-hidden="true">{bar.emoji} </span>}
        {bar.label}
      </span>
      <div
        role="progressbar"
        aria-label={bar.label}
        aria-valuemin={0}
        aria-valuemax={bar.total}
        aria-valuenow={bar.done}
        aria-valuetext={categoryBarViewValueText(bar)}
        className="h-[var(--space-2)] w-full overflow-hidden rounded-[var(--radius-full)] bg-surface-2"
      >
        <span
          aria-hidden="true"
          className={cn(
            'block h-full rounded-[var(--radius-full)] bg-[var(--cat-color,var(--color-faint))]',
          )}
          style={{ width: `${bar.ratio * 100}%` }}
        />
      </div>
      <span aria-hidden="true" className="text-sm text-muted tabular-nums">
        {bar.done}/{bar.total}
      </span>
    </div>
  );
}
