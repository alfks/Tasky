'use client';

// 메인 상단 고정 영역 (app-shell.md §2-A · R3 높이 ≤160px · R15 타이머 칩).
//
// 월 표시·‹ ›·[오늘] 은 `DateStrip` 이 이미 갖고 있다(date-strip §2-A) — 여기서 다시 그리지 않는다.
// 셸이 더하는 것은 그 위 한 줄: ☰(사이드바가 컬럼이 아닐 때) · 타이머 칩 · 달성률 요약이다.
//
// **달성률을 헤더에서 링으로 그리지 않는다.** 인사이트 컬럼이 서 있을 때는 같은 값이 120px 링으로
// 바로 오른쪽에 있어(두 링 사이 실측 ~160px) 같은 숫자가 두 번, 100% 때는 "다 했어요 🎉" 까지 두 번
// 나왔다. 그래서 컬럼이 있을 때 헤더는 **숫자 한 줄**만 맡고(R3 의 "달성률 요약"), 컬럼이 없을 때만
// 링이 달린 버튼이 되어 오버레이를 연다(R6). 덤으로 고정 영역이 40px → 32px 로 줄어 상한에 여유가 생겼다.
import type { DateKey } from '@/domain/date/date-key';

import { DateStrip } from '@/features/date-strip';
import {
  CompletionRing,
  completionAnnouncement,
  completionCountText,
  completionPercentText,
} from '@/features/stats';
import type { CompletionSummary } from '@/features/stats';
import { TimerChip } from '@/features/timer';

import { IconButton } from '@/components/ui/IconButton';

/** 오버레이 패널의 id — 여는 버튼의 `aria-controls` 가 가리킨다(열려 있을 때만 존재한다). */
export const INSIGHT_OVERLAY_ID = 'shell-insight-overlay';

/**
 * 접힌 영역의 **자리를 잇는 컨트롤** 표식. 접기 토글이 자기 영역을 없앨 때 셸이 이 표식으로 후임을
 * 찾아 포커스를 넘긴다(`lib/focus-fallback.ts`). 접근 이름이 아니라 표식으로 찾는 이유는 문구가
 * 바뀌어도 배선이 끊기지 않게 하려는 것이다.
 */
export const DRAWER_OPENER_ATTR = 'data-shell-drawer-opener';
export const INSIGHT_OPENER_ATTR = 'data-shell-insight-opener';

type ShellHeaderProps = {
  summary: CompletionSummary;
  /** 사이드바가 컬럼으로 서 있는가. 아니면 ☰ 버튼을 낸다(§2-B). */
  sidebarIsColumn: boolean;
  /** 인사이트가 컬럼으로 서 있는가. 아니면 달성률이 오버레이를 여는 버튼이 된다(R6). */
  insightIsColumn: boolean;
  insightOverlayOpen: boolean;
  onOpenDrawer: () => void;
  /** 타이머 칩·달성률 버튼이 인사이트를 "연다" — 컬럼이면 그리로 데려가고, 아니면 오버레이다. */
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
          <IconButton
            {...{ [DRAWER_OPENER_ATTR]: '' }}
            label="카테고리 열기"
            onClick={onOpenDrawer}
          >
            ☰
          </IconButton>
        )}
        <div className="flex-1" />
        {/* R15: 세션이 없으면 칩은 아무것도 렌더하지 않는다 — 자리를 차지하지 않는다. */}
        <TimerChip onOpen={onOpenInsight} />
        {insightIsColumn ? (
          <p className="text-base text-muted tabular-nums">{completionCountText(summary)}</p>
        ) : (
          <button
            type="button"
            {...{ [INSIGHT_OPENER_ATTR]: '' }}
            aria-label="오늘 요약 열기"
            aria-expanded={insightOverlayOpen}
            /* 닫혀 있는 동안 오버레이 패널은 DOM 에 없다 — 없는 id 를 가리키면 보조기술이
               "제어 대상 없음" 으로 읽는다. 열렸을 때만 연결한다(§5). */
            aria-controls={insightOverlayOpen ? INSIGHT_OVERLAY_ID : undefined}
            onClick={onOpenInsight}
            className="flex h-[var(--control-hit-min)] items-center gap-[var(--space-2)] rounded-[var(--radius-full)] border border-border bg-surface px-[var(--space-3)] text-base font-semibold text-text hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <CompletionRing summary={summary} size={20} thickness={3} />
            <span aria-hidden="true">{completionPercentText(summary)}</span>
          </button>
        )}
        {/* 달성률을 읽는 라이브 영역은 어느 갈래에서도 **여기 하나**다(§5). */}
        <span aria-live="polite" className="sr-only">
          {completionAnnouncement(summary)}
        </span>
      </div>

      <DateStrip onDropTodo={onDropTodo} onSummaryError={onSummaryError} />
    </div>
  );
}
