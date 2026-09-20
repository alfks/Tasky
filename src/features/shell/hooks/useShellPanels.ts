// 두 패널(사이드바·인사이트)의 "지금 컬럼인가 / 어떻게 열고 접는가" (app-shell.md §2-B · R5~R7).
//
// 접힘·열림 상태 자체는 `shell-ui-store` 에 있고, 여기서는 **폭과 엮어 판단하는 부분**과 접을 때의
// 포커스 인계만 맡는다. 접기 토글은 자기가 들어 있던 영역을 없애므로, 그대로 두면 누른 그 순간
// 포커스가 `<body>` 로 떨어진다(접근성 리뷰 실측 2경로).
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
  /** 컬럼이 서 있으면 그 패널로 데려가고, 아니면 오버레이를 연다. */
  openInsight: () => void;
  /** `[접기]`. 포커스가 패널 안이었으면 헤더의 여는 버튼으로 넘긴다. */
  collapseInsight: () => void;
  /** `Mod+\` 와 ☰. 컬럼이면 접고, 아니면 드로어를 여닫는다. */
  toggleSidebar: () => void;
  openDrawer: () => void;
  closeDrawer: () => void;
  closeInsightOverlay: () => void;
  asideRef: RefObject<HTMLElement | null>;
  sidebarRef: RefObject<HTMLDivElement | null>;
};

export function useShellPanels(): ShellPanels {
  const layout = useShellLayout();
  const sidebarCollapsed = useShellUiStore((s) => s.sidebarCollapsed);
  const insightCollapsed = useShellUiStore((s) => s.insightCollapsed);
  const drawerOpen = useShellUiStore((s) => s.drawerOpen);
  const insightOverlayOpen = useShellUiStore((s) => s.insightOverlayOpen);
  const toggleSidebarPref = useShellUiStore((s) => s.toggleSidebar);
  const toggleInsightPref = useShellUiStore((s) => s.toggleInsight);
  const setDrawerOpen = useShellUiStore((s) => s.setDrawerOpen);
  const setInsightOverlayOpen = useShellUiStore((s) => s.setInsightOverlayOpen);

  const asideRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);

  const sidebarIsColumn = hasSidebarColumn(layout) && !sidebarCollapsed;
  const insightIsColumn = hasInsightColumn(layout) && !insightCollapsed;

  // 컬럼이 서면 드로어·오버레이는 의미가 없다 — 같은 내용이 두 번 뜨고 랜드마크가 둘이 된다(R1).
  // 폭 변화만이 아니라 **접힘 토글**도 이 자리를 지나야 한다.
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
      if (!hasSidebarColumn(layout)) {
        setDrawerOpen(!drawerOpen);
        return;
      }
      if (sidebarIsColumn) handoffFocus(sidebarRef.current, `[${DRAWER_OPENER_ATTR}]`);
      toggleSidebarPref();
    },
    openDrawer: () => setDrawerOpen(true),
    closeDrawer: () => setDrawerOpen(false),
    closeInsightOverlay: () => setInsightOverlayOpen(false),
  };
}
