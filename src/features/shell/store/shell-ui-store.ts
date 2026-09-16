// 셸 레이아웃 상태 (app-shell.md R5·R6·R7). 저장소를 읽지 않는다 — 접힘 상태는 기기별 설정이라
// localStorage 에만 산다(R5: 백업에 포함되지 않는다).
//
// 접힘(collapsed)과 열림(open)을 **다른 필드로** 둔다. 접힘은 넓은 화면에서 사용자가 고정해 둔
// 선호이고 새로고침을 넘어 남는다. 열림은 좁은 화면의 드로어·오버레이라 세션 안에서만 산다 —
// 섞으면 드로어를 한 번 연 것이 다음 방문의 사이드바 상태를 바꾼다.
import { create } from 'zustand';

import { readUiPrefs, writeUiPrefs, type UiPrefs } from '@/features/shell/lib/ui-prefs';

export type ShellUiState = UiPrefs & {
  /** 좁은 화면(≤1023px)의 사이드바 드로어. */
  drawerOpen: boolean;
  /** 1279px 이하 또는 인사이트를 접었을 때의 `◯ 60%` 오버레이. */
  insightOverlayOpen: boolean;
  toggleSidebar: () => void;
  toggleInsight: () => void;
  setDrawerOpen: (open: boolean) => void;
  setInsightOverlayOpen: (open: boolean) => void;
};

/** 다음 선호를 저장하고 그대로 돌려준다 — `set` 한 값과 저장한 값이 갈릴 수 없다. */
function persist(prefs: UiPrefs): UiPrefs {
  writeUiPrefs(prefs);
  return prefs;
}

export const useShellUiStore = create<ShellUiState>((set, get) => ({
  ...readUiPrefs(),
  drawerOpen: false,
  insightOverlayOpen: false,
  toggleSidebar: () =>
    set(persist({ ...prefsOf(get()), sidebarCollapsed: !get().sidebarCollapsed })),
  toggleInsight: () =>
    set(persist({ ...prefsOf(get()), insightCollapsed: !get().insightCollapsed })),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setInsightOverlayOpen: (open) => set({ insightOverlayOpen: open }),
}));

/** 상태에서 **저장 대상 두 필드만** 뽑는다. 드로어 열림이 localStorage 에 새는 것을 막는다. */
function prefsOf(state: ShellUiState): UiPrefs {
  return { sidebarCollapsed: state.sidebarCollapsed, insightCollapsed: state.insightCollapsed };
}
