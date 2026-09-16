'use client';

import { type CompletionSummary, completionRingLabel } from '@/features/stats/completion-view';
import { useCompletionPulse } from '@/features/stats/hooks/useCompletionPulse';

import { ProgressRing } from '@/components/ui/ProgressRing';

import { cn } from '@/lib/cn';

type CompletionRingProps = {
  summary: CompletionSummary;
  /** 지름 px — 헤더 40, 인사이트 패널 120 (R7). */
  size: number;
  /** 링 굵기 px — 헤더 4, 패널 10 (R7). */
  thickness: number;
  className?: string;
};

/**
 * 달성률 링 + 100% 펄스 (R3·R4). 링은 그래픽만 남지 않는다 — 퍼센트와 개수가 `aria-label` 로
 * 함께 읽힌다(§5). 그래서 옆에 찍는 같은 숫자는 호출부가 `aria-hidden` 으로 가린다.
 */
export function CompletionRing({ summary, size, thickness, className }: CompletionRingProps) {
  const pulseRef = useCompletionPulse<HTMLSpanElement>(summary.rate);

  return (
    <span ref={pulseRef} className={cn('inline-flex', className)}>
      <ProgressRing
        value={summary.rate}
        size={size}
        thickness={thickness}
        label={completionRingLabel(summary)}
      />
    </span>
  );
}
