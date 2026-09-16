'use client';

// 메인 상단 고정 영역 (app-shell.md §2-A · R3 높이 ≤160px · R15 타이머 칩).
//
// 월 표시·‹ ›·[오늘] 은 `DateStrip` 이 이미 갖고 있다(date-strip §2-A) — 여기서 다시 그리지 않는다.
// 셸이 더하는 것은 그 위 한 줄: ☰(사이드바가 컬럼이 아닐 때) · 타이머 칩 · 달성률이다.
import type { DateKey } from '@/domain/date/date-key';

import { DateStrip } from '@/features/date-strip';
import {
  CompletionHeader,
  CompletionRing,
  completionAnnouncement,
  completionPercentText,
} from '@/features/stats';
import type { CompletionSummary } from '@/features/stats';
import { TimerChip } from '@/features/timer';

import { IconButton } from '@/components/ui/IconButton';

/** 오버레이 패널의 id — 여는 버튼의 `aria-controls` 가 가리킨다. */
export const INSIGHT_OVERLAY_ID = 'shell-insight-overlay';

type ShellHeaderProps = {
  summary: CompletionSummary;
  /** 사이드바가 컬럼으로 서 있는가. 아니면 ☰ 버튼을 낸다(§2-B). */
  sidebarIsColumn: boolean;
  /** 인사이트가 컬럼으로 서 있는가. 아니면 달성률이 오버레이를 여는 버튼이 된다(R6). */
  insightIsColumn: boolean;
  insightOverlayOpen: boolean;
  onOpenDrawer: () => void;
  onOpenInsight: () => void;
  onSummaryError: (message: string) => void;
  onDropTodo: (todoId: string, date: DateKey) => void;
};

export function ShellHeader({
  summary,
  sidebarIsColumn,
  insightIsColumn,
  insightOverlayOpen,
  onOpenDrawer,
  onOpenInsight,
  onSummaryError,
  onDropTodo,
}: ShellHeaderProps) {
  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <div className="flex min-h-[var(--control-hit-min)] items-center gap-[var(--space-2)]">
        {sidebarIsColumn ? null : (
          <IconButton label="카테고리 열기" onClick={onOpenDrawer}>
            ☰
          </IconButton>
        )}
        <div className="flex-1" />
        {/* R15: 세션이 없으면 칩은 아무것도 렌더하지 않는다 — 자리를 차지하지 않는다. */}
        <TimerChip onOpen={onOpenInsight} />
        {insightIsColumn ? (
          <CompletionHeader />
        ) : (
          <button
            type="button"
            aria-label="오늘 요약 열기"
            aria-expanded={insightOverlayOpen}
            aria-controls={INSIGHT_OVERLAY_ID}
            onClick={onOpenInsight}
            className="flex h-[var(--control-hit-min)] items-center gap-[var(--space-2)] rounded-[var(--radius-full)] border border-border bg-surface px-[var(--space-3)] text-base font-semibold text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <CompletionRing summary={summary} size={20} thickness={3} />
            <span aria-hidden="true">{completionPercentText(summary)}</span>
          </button>
        )}
        {/* 컬럼이 없을 때는 `CompletionHeader` 도 없다 — 낭독 영역이 통째로 사라지지 않게 여기 둔다.
            두 갈래가 동시에 그려지는 일은 없으므로 라이브 영역은 언제나 하나다(§5). */}
        {insightIsColumn ? null : (
          <span aria-live="polite" className="sr-only">
            {completionAnnouncement(summary)}
          </span>
        )}
      </div>

      <DateStrip onDropTodo={onDropTodo} onSummaryError={onSummaryError} />
    </div>
  );
}
