'use client';

// 인사이트 패널 (app-shell.md §2-A · R1 `aside` · R6 섹션 순서 고정).
//
// 섹션 순서는 **집중 → 달성률 → 카테고리별 → 단축키** 로 고정이다(R6). 각 섹션의 내용은 그 feature
// 가 그리고, 여기서는 순서·카드 껍질·접기만 맡는다. Phase 2 의 캘린더·통계 위젯도 이 목록에 낀다.
import type { ReactNode } from 'react';

import type { Category } from '@/domain/category/category';

import { useCommandStore } from '@/features/command';
import { CategoryPanelSection, CompletionPanelSection } from '@/features/stats';
import { TimerPanelSection } from '@/features/timer';

import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';

import { cn } from '@/lib/cn';

/**
 * 패널 섹션의 **카드 껍질** = 이 앱의 상시 카드(app-shell.md §2-A "면과 고도").
 * `TimerPanelSection` 은 자기 카드를 갖고 있어 그것과 같은 값을 쓴다(`rounded-xl` + 1px 보더 +
 * `bg-surface` + `p-4`). 껍질을 셸이 쥐는 이유: 세 섹션이 각자 정하면 지금처럼 하나만 카드이고
 * 둘은 맨 텍스트가 되어 패널이 만들다 만 것처럼 읽힌다(리뷰 Major).
 *
 * `shadow-sm`(= `--elev-sm`)은 세 카드에 **함께** 걸어야 한다 — 하나만 떠 있으면 패널 안에서
 * 고도가 두 층으로 갈린다. 타이머 카드는 자기 클래스를 갖고 있으므로 아래에서 같은 값을
 * `className` 으로 넘겨 맞춘다.
 */
const CARD_CLASS =
  'rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-4)] shadow-sm';

/** 컬럼으로 선 패널의 id — `[접기]` 의 `aria-controls` 가 가리킨다(§5). */
export const INSIGHT_PANEL_ID = 'shell-insight-panel';

type ShellInsightsProps = {
  categories: readonly Category[];
  /** 컬럼으로 서 있을 때만 `[접기]` 가 있다. 오버레이 안에서는 ✕ 가 그 일을 한다(R6·R7). */
  onCollapse?: () => void;
  /** 접기 버튼이 제어하는 패널의 id. 컬럼일 때만 준다. */
  panelId?: string;
  className?: string;
};

function Card({ children }: { children: ReactNode }) {
  return <div className={CARD_CLASS}>{children}</div>;
}

export function ShellInsights({ categories, onCollapse, panelId, className }: ShellInsightsProps) {
  const openHelp = useCommandStore((state) => state.openHelp);

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col gap-[var(--space-4)] overflow-y-auto', className)}
    >
      <TimerPanelSection className="shadow-sm" />
      <Card>
        <CompletionPanelSection />
      </Card>
      <Card>
        <CategoryPanelSection categories={categories} />
      </Card>

      <div className="mt-auto flex shrink-0 items-center justify-between gap-[var(--space-2)] pt-[var(--space-3)]">
        <Button variant="ghost" size="sm" onClick={openHelp}>
          단축키 <Kbd>?</Kbd>
        </Button>
        {onCollapse === undefined ? null : (
          <Button
            variant="ghost"
            size="sm"
            aria-expanded
            aria-controls={panelId}
            onClick={onCollapse}
          >
            접기
          </Button>
        )}
      </div>
    </div>
  );
}
