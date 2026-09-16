'use client';

// 인사이트 패널 (app-shell.md §2-A · R1 `aside` · R6 섹션 순서 고정).
//
// 섹션 순서는 **집중 → 달성률 → 카테고리별 → 단축키** 로 고정이다(R6). 각 섹션의 내용은 그 feature
// 가 그리고, 여기서는 순서와 접기만 맡는다. Phase 2 의 캘린더·통계 위젯도 이 목록에 끼워 넣는다.
import type { Category } from '@/domain/category/category';

import { useCommandStore } from '@/features/command';
import { CategoryPanelSection, CompletionPanelSection } from '@/features/stats';
import { TimerPanelSection } from '@/features/timer';

import { Button } from '@/components/ui/Button';
import { Kbd } from '@/components/ui/Kbd';

type ShellInsightsProps = {
  categories: readonly Category[];
  /** 컬럼으로 서 있을 때만 `[접기]` 가 있다. 오버레이 안에서는 ✕ 가 그 일을 한다(R6·R7). */
  onCollapse?: () => void;
};

export function ShellInsights({ categories, onCollapse }: ShellInsightsProps) {
  const openHelp = useCommandStore((state) => state.openHelp);

  return (
    <div className="flex h-full min-h-0 flex-col gap-[var(--space-5)] overflow-y-auto">
      <TimerPanelSection />
      <CompletionPanelSection />
      <CategoryPanelSection categories={categories} />

      <div className="mt-auto flex items-center justify-between gap-[var(--space-2)] border-t border-border pt-[var(--space-3)]">
        <Button variant="ghost" size="sm" onClick={openHelp}>
          단축키 <Kbd>?</Kbd>
        </Button>
        {onCollapse === undefined ? null : (
          <Button variant="ghost" size="sm" onClick={onCollapse}>
            접기
          </Button>
        )}
      </div>
    </div>
  );
}
