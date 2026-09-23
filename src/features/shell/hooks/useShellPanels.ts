// 두 패널(사이드바·인사이트)의 "지금 컬럼인가 / 어떻게 열고 접는가" (app-shell.md §2-B · R5~R7,
// calendar-layout.md R23~R24).
//
// 고정·접힘·열림 상태 자체는 `shell-ui-store` 에 있고, 여기서는 **폭과 엮어 판단하는 부분**과 접을
// 때의 포커스 인계만 맡는다. 접기 토글은 자기가 들어 있던 영역을 없애므로, 그대로 두면 누른 그 순간
// 포커스가 `<body>` 로 떨어진다(접근성 리뷰 실측 2경로).
//
// **사이드바는 이제 "드로어가 기본, 고정이 예외"다**(calendar-layout.md §1-A). 컬럼 여부의 판정식
// 자체(`hasSidebarColumn`·`hasInsightColumn`, R24)는 `layout.ts` 가 갖고 있다 — 여기서는 그 결과에
// `sidebarPinned`·`insightCollapsed` 두 선호를 얹기만 한다(단일 소스가 두 곳으로 갈리지 않게).
import { useEffect, useRef, type RefObject } from 'react';

import { DRAWER_OPENER_ATTR, INSIGHT_OPENER_ATTR } from '@/features/shell/components/ShellHeader';
import { useShellLayout } from '@/features/shell/hooks/useShellLayout';
import { hasInsightColumn, hasSidebarColumn, type ShellLayout } from '@/features/shell/lib/layout';
import { useShellUiStore } from '@/features/shell/store/shell-ui-store';

import { handoffFocus, revealAndFocus } from '@/lib/focus-fallback';

export type ShellPanels = {
  layout: ShellLayout;
  sidebarIsColumn: boolean;
  insightIsColumn: boolean;
  drawerOpen: boolean;
  insightOverlayOpen: boolean;
  /** 사이드바가 240px 컬럼으로 고정돼 있는가(`wide` 에서만 의미가 있다, R23). */
  sidebarPinned: boolean;
  /** 컬럼이 서 있으면 그 패널로 데려가고, 아니면 오버레이를 연다. */
  openInsight: () => void;
  /** `[접기]`. 포커스가 패널 안이었으면 헤더의 여는 버튼으로 넘긴다. */
  collapseInsight: () => void;
  /** `Mod+\` 와 ☰. 컬럼이면 고정을 풀고 드로어로 내려가고, 아니면 드로어를 여닫는다. */
  toggleSidebar: () => void;
  /** `[고정]`/`[고정 해제]`. 컬럼이었으면 드로어 여는 버튼으로 포커스를 넘긴다. */
  toggleSidebarPinned: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  closeInsightOverlay: () => void;
  asideRef: RefObject<HTMLElement | null>;
  sidebarRef: RefObject<HTMLDivElement | null>;
};

export function useShellPanels(): ShellPanels {
  const layout = useShellLayout();
  const sidebarPinned = useShellUiStore((s) => s.sidebarPinned);
  const insightCollapsed = useShellUiStore((s) => s.insightCollapsed);
  const drawerOpen = useShellUiStore((s) => s.drawerOpen);
  const insightOverlayOpen = useShellUiStore((s) => s.insightOverlayOpen);
  const toggleSidebarPinnedPref = useShellUiStore((s) => s.toggleSidebarPinned);
  const toggleInsightPref = useShellUiStore((s) => s.toggleInsight);
  const setDrawerOpen = useShellUiStore((s) => s.setDrawerOpen);
  const setInsightOverlayOpen = useShellUiStore((s) => s.setInsightOverlayOpen);

  const asideRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  // R24: 사이드바 컬럼은 `wide` + 고정일 때만. 인사이트 컬럼은 `wide`·`mid` 양쪽 + 접지 않았을 때.
  const sidebarIsColumn = hasSidebarColumn(layout, sidebarPinned);
  const insightIsColumn = hasInsightColumn(layout) && !insightCollapsed;

  // 컬럼이 서면 드로어·오버레이는 의미가 없다 — 같은 내용이 두 번 뜨고 랜드마크가 둘이 된다(R1).
  // 폭 변화만이 아니라 **고정·접힘 토글**도 이 자리를 지나야 한다.
  useEffect(() => {
    if (sidebarIsColumn) setDrawerOpen(false);
    if (insightIsColumn) setInsightOverlayOpen(false);
  }, [sidebarIsColumn, insightIsColumn, setDrawerOpen, setInsightOverlayOpen]);

  return {
    layout,
    sidebarIsColumn,
    insightIsColumn,
    drawerOpen,
    insightOverlayOpen,
    sidebarPinned,
    asideRef,
    sidebarRef,
    openInsight: () => {
      if (insightIsColumn) revealAndFocus(asideRef.current);
      else setInsightOverlayOpen(true);
    },
    collapseInsight: () => {
      handoffFocus(asideRef.current, `[${INSIGHT_OPENER_ATTR}]`);
      toggleInsightPref();
    },
    toggleSidebar: () => {
      if (sidebarIsColumn) {
        handoffFocus(sidebarRef.current, `[${DRAWER_OPENER_ATTR}]`);
        toggleSidebarPinnedPref();
        return;
      }
      setDrawerOpen(!drawerOpen);
    },
    toggleSidebarPinned: () => {
      if (sidebarIsColumn) handoffFocus(sidebarRef.current, `[${DRAWER_OPENER_ATTR}]`);
      toggleSidebarPinnedPref();
    },
    openDrawer: () => setDrawerOpen(true),
    closeDrawer: () => setDrawerOpen(false),
    closeInsightOverlay: () => setInsightOverlayOpen(false),
  };
}
