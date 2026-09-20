'use client';

import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

type ReportsCardProps = {
  title: string;
  /** 이 기간에 보여줄 것이 없을 때(§2 빈 상태) — 주면 `children` 대신 이 문구가 뜬다. */
  emptyMessage?: string;
  children: ReactNode;
  className?: string;
};

/**
 * 통계 화면의 카드 껍데기(stats.md §2). 제목은 `h2`, 카드는 `section` 랜드마크다.
 * 빈 상태 문구는 카드마다 독립적으로 판단한다 — 조회 자체는 화면 전체가 한 번에 하지만(R7),
 * "이 기간에 보여줄 게 있는가"는 카드별 데이터로 따로 정해질 수 있다.
 */
export function ReportsCard({ title, emptyMessage, children, className }: ReportsCardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex flex-col gap-[var(--space-2)] rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-4)] shadow-sm',
        className,
      )}
    >
      <h2 id={headingId} className="text-base font-[var(--font-weight-semibold)] text-text">
        {title}
      </h2>
      {emptyMessage !== undefined ? (
        <p className="text-sm text-muted">{emptyMessage}</p>
      ) : (
        children
      )}
    </section>
  );
}
