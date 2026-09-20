'use client';

import { useId, type ReactNode } from 'react';

import { cn } from '@/lib/cn';

type ReportsCardProps = {
  title: string;
  children: ReactNode;
  className?: string;
};

/**
 * 통계 화면의 카드 껍데기(stats.md §2). 카드는 `section` 랜드마크다.
 *
 * 제목은 `h3` 다(review m9) — 문서엔 앱 전체의 `h1`(`Tasky`) 하나, 이 화면 자신의 `h2`("통계",
 * `ReportsScreen.tsx`)가 있고, 카드는 그 아래 항목이라 `h2`를 또 쓰면 같은 레벨이 중복된다.
 *
 * 빈 상태 문구는 카드마다 독립적으로 판단한다 — 조회 자체는 화면 전체가 한 번에 하지만(R7),
 * "보여줄 게 있는가"는 카드별 데이터로 따로 정해질 수 있다. 각 카드 컴포넌트가 자기 `children`
 * 자리에 직접 빈 문구를 그린다(review n3 — 이 컴포넌트가 대신 갈아 끼우는 `emptyMessage` prop은
 * 실제로 아무도 안 써 죽은 코드였다, 걷어냈다).
 */
export function ReportsCard({ title, children, className }: ReportsCardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={cn(
        'flex flex-col gap-[var(--space-2)] rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-4)] shadow-sm',
        className,
      )}
    >
      <h3 id={headingId} className="text-base font-[var(--font-weight-semibold)] text-text">
        {title}
      </h3>
      {children}
    </section>
  );
}
