'use client';

import {
  CELEBRATION_TEXT,
  completionAnnouncement,
  completionCountText,
  completionPercentText,
} from '@/features/stats/completion-view';
import { CompletionRing } from '@/features/stats/components/CompletionRing';
import { useCompletion } from '@/features/stats/hooks/useCompletion';
import { useCompletionAnnouncement } from '@/features/stats/hooks/useCompletionPulse';

import { cn } from '@/lib/cn';

/** 헤더 링 치수 (R7). */
const RING_SIZE = 40;
const RING_THICKNESS = 4;

type CompletionHeaderProps = { className?: string };

/**
 * 메인 상단 고정 영역의 달성률 (§2). 인터랙션이 없는 표시 블록이다 — 좁은 화면에서 오버레이
 * 패널을 여는 `◔ 60%` **버튼은 앱 셸(app-shell §2-B)** 이 이 링을 감싸 만든다.
 */
export function CompletionHeader({ className }: CompletionHeaderProps) {
  const summary = useCompletion();
  const announcement = useCompletionAnnouncement(completionAnnouncement(summary));

  return (
    <div className={cn('flex items-center gap-[var(--space-3)]', className)}>
      <CompletionRing summary={summary} size={RING_SIZE} thickness={RING_THICKNESS} />
      {/* 링 라벨이 같은 숫자를 이미 읽는다 — 가리지 않으면 토글 한 번에 세 번 낭독된다(§5). */}
      <span aria-hidden="true" className="text-lg font-bold text-text">
        {completionPercentText(summary)}
      </span>
      <span aria-hidden="true" className="text-base text-muted tabular-nums">
        {completionCountText(summary)}
      </span>
      {summary.rate === 1 && <span className="text-base text-muted">{CELEBRATION_TEXT}</span>}
      <span aria-live="polite" className="sr-only">
        {announcement}
      </span>
    </div>
  );
}
