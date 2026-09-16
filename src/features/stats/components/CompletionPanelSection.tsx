'use client';

import { useId } from 'react';

import {
  CELEBRATION_TEXT,
  completionCountText,
  completionPercentText,
} from '@/features/stats/completion-view';
import { CompletionRing } from '@/features/stats/components/CompletionRing';
import { useCompletion } from '@/features/stats/hooks/useCompletion';

import { cn } from '@/lib/cn';

/** 패널 링 치수 (R7). */
const RING_SIZE = 120;
const RING_THICKNESS = 10;

type CompletionPanelSectionProps = { className?: string };

/**
 * 인사이트 패널의 "오늘 달성률" 섹션 (§2). 패널 안 섹션 순서(집중 → 달성률 → 카테고리별 →
 * 단축키)는 앱 셸이 정한다(app-shell R6) — 여기서는 한 섹션만 그린다.
 */
export function CompletionPanelSection({ className }: CompletionPanelSectionProps) {
  const headingId = useId();
  const summary = useCompletion();

  return (
    <section
      aria-labelledby={headingId}
      className={cn('flex flex-col gap-[var(--space-3)]', className)}
    >
      <h2 id={headingId} className="text-md font-semibold text-text">
        오늘 달성률
      </h2>
      <div className="flex items-center gap-[var(--space-4)]">
        <CompletionRing summary={summary} size={RING_SIZE} thickness={RING_THICKNESS} />
        <div className="flex flex-col gap-[var(--space-1)]">
          {/* 링 라벨이 같은 숫자를 읽는다 — 중복 낭독을 막는다(§5). */}
          <span aria-hidden="true" className="text-3xl font-bold text-text">
            {completionPercentText(summary)}
          </span>
          <span aria-hidden="true" className="text-base text-muted tabular-nums">
            {completionCountText(summary)}
          </span>
          {summary.rate === 1 && <span className="text-base text-muted">{CELEBRATION_TEXT}</span>}
        </div>
      </div>
    </section>
  );
}
