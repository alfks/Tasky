'use client';

// 인사이트 패널 (app-shell.md §2-A · R1 `aside` · R6 섹션 순서 고정).
//
// 섹션 순서는 **집중 → 달성률 → 단축키** 로 고정이다(R6). 카테고리별 막대는 폐지됐다 — 그 값은
// 이제 각 카테고리 그룹 헤더(카테고리 이름 옆, `TodoGroupSection`)에서 보인다(사용자 결정). D-day는
// 카테고리쪽 사이드바로 옮겨졌다(`ShellSidebar.tsx`) — 이 패널에는 더는 없다. 각 섹션의 내용은 그
// feature 가 그리고, 여기서는 순서·카드 껍질·접기만 맡는다.
//
// **집중은 이 중 유일하게 "있을 때만" 그려지는 섹션이다**(사용자 결정, R6 갱신) — 보여줄 상태가
// 없으면(대기) 아예 마운트하지 않는다. 그려질 때는 여전히 맨 앞이라 순서 자체는 바뀌지 않는다.
import type { ReactNode } from 'react';

import { useCommandStore } from '@/features/command';
import { CompletionPanelSection } from '@/features/stats';
import { selectTimerPanelVisible, TimerPanelSection, useTimerStore } from '@/features/timer';

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
  /** 컬럼으로 서 있을 때만 `[접기]` 가 있다. 오버레이 안에서는 ✕ 가 그 일을 한다(R6·R7). */
  onCollapse?: () => void;
  /** 접기 버튼이 제어하는 패널의 id. 컬럼일 때만 준다. */
  panelId?: string;
  className?: string;
};

function Card({ children }: { children: ReactNode }) {
  return <div className={CARD_CLASS}>{children}</div>;
}

export function ShellInsights({ onCollapse, panelId, className }: ShellInsightsProps) {
  const openHelp = useCommandStore((state) => state.openHelp);
  // 대기 중(세션·휴식·알림·완료·에러가 전부 비었을 때)에는 이 섹션 자체를 그리지 않는다(사용자
  // 결정 — "집중 부분이 메인 화면에서 없어졌으면 좋겠다"). 시작은 이제 항목 메뉴 "타이머 시작"
  // (todo.md §2-A) 또는 커맨드 팔레트다 — 대기 화면(투두 선택·길이 프리셋)은 그래서 상시 자리가
  // 필요 없다. `TimerChip`(헤더)은 이 섹션과 무관하게 계속 마운트돼 있어 적재·1초 갱신은 끊기지
  // 않는다(`@/features/timer` 머리 주석).
  const timerPanelVisible = useTimerStore(selectTimerPanelVisible);

  return (
    <div
      className={cn('flex h-full min-h-0 flex-col gap-[var(--space-4)] overflow-y-auto', className)}
    >
      {timerPanelVisible ? <TimerPanelSection className="shadow-sm" /> : null}
      <Card>
        <CompletionPanelSection />
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
