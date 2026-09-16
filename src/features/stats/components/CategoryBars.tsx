'use client';

import type { CSSProperties } from 'react';

import type { Category } from '@/domain/category/category';

import {
  type CategoryBar,
  EMPTY_CATEGORY_MESSAGE,
  categoryBarValueText,
} from '@/features/stats/completion-view';
import { useCategoryBars } from '@/features/stats/hooks/useCompletion';

import { cn } from '@/lib/cn';

/** 카테고리 색은 CSS 변수로만 흘린다(code-style §3 "동적 색상만 CSS 변수"). */
type CategoryBarStyle = CSSProperties & Partial<Record<'--cat-color', string>>;

type CategoryBarsProps = {
  /**
   * 이름·색·순서의 출처. 그날 투두가 있는 카테고리만 막대가 된다(R5) — 걸러내는 것은
   * `summarizeByCategory` 이고 이 컴포넌트는 걸러진 결과를 그린다.
   * 삭제된 카테고리의 이름까지 보이려면 툼스톤을 포함해 넘긴다.
   */
  categories: readonly Category[];
  className?: string;
};

/** 카테고리별 달성률 막대 목록 (R5). */
export function CategoryBars({ categories, className }: CategoryBarsProps) {
  const bars = useCategoryBars(categories);

  if (bars.length === 0) {
    return <p className={cn('text-base text-muted', className)}>{EMPTY_CATEGORY_MESSAGE}</p>;
  }

  return (
    <ul className={cn('flex flex-col gap-[var(--space-2)]', className)}>
      {bars.map((bar) => (
        <li key={bar.categoryId}>
          <CategoryBarRow bar={bar} />
        </li>
      ))}
    </ul>
  );
}

/**
 * 한 줄: 이름 · 막대 · `done/total`. 색만으로 정보를 전달하지 않도록 숫자를 항상 병기하고(§5),
 * 막대 자체는 `progressbar` 로 값을 읽힌다.
 */
function CategoryBarRow({ bar }: { bar: CategoryBar }) {
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
        aria-valuetext={categoryBarValueText(bar)}
        className="h-[var(--space-2)] w-full overflow-hidden rounded-[var(--radius-full)] bg-surface-2"
      >
        <span
          aria-hidden="true"
          // 카테고리 행이 사라져 색을 모를 때만 --color-faint 로 떨어진다(장식 — 숫자가 정보를 낸다).
          className="block h-full rounded-[var(--radius-full)] bg-[var(--cat-color,var(--color-faint))] transition-[width] duration-[var(--motion-base)] ease-[var(--motion-ease)]"
          style={{ width: `${bar.ratio * 100}%` }}
        />
      </div>
      <span aria-hidden="true" className="text-sm text-muted tabular-nums">
        {bar.done}/{bar.total}
      </span>
    </div>
  );
}
