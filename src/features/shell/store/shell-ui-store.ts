// 셸 레이아웃 상태 (app-shell.md R5·R6·R7, calendar-layout.md R23~R24). 저장소를 읽지 않는다 —
// 사이드바 고정 여부·인사이트 접힘 상태는 기기별 설정이라 localStorage 에만 산다(R5: 백업에
// 포함되지 않는다).
//
// **`sidebarPinned`(고정)과 `insightCollapsed`(접힘)은 뜻이 반대 극이다** — 인사이트는 "펼침이
// 기본, 접으면 숨는다"이고 사이드바는 "드로어가 기본, 고정해야 컬럼이 선다"(calendar-layout.md
// §1-A). 필드 이름을 그대로 두는 이유는 각자의 반대말을 그대로 코드에 옮긴 것뿐이다 — 두 값을
// 같은 극성으로 맞추려 하지 않는다.
//
// 고정(pinned)과 열림(open)을 **다른 필드로** 둔다. 고정은 넓은 화면에서 사용자가 정해 둔
// 선호이고 새로고침을 넘어 남는다. 열림은 좁은 화면의 드로어·오버레이라 세션 안에서만 산다 —
// 섞으면 드로어를 한 번 연 것이 다음 방문의 사이드바 상태를 바꾼다.
import { create } from 'zustand';

import { readUiPrefs, writeUiPrefs, type UiPrefs } from '@/features/shell/lib/ui-prefs';

export type ShellUiState = UiPrefs & {
  /** 좁은 화면(≤1023px)의 사이드바 드로어. `sidebarPinned` 가 아니어도 ≥1280 에서 열 수 있다
   * (calendar-layout.md §1-A — 모든 폭에서 드로어가 기본 경로다). */
  drawerOpen: boolean;
  /** 1279px 이하 또는 인사이트를 접었을 때의 `◯ 60%` 오버레이. */
  insightOverlayOpen: boolean;
  toggleSidebarPinned: () => void;
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
  toggleSidebarPinned: () =>
    set(persist({ ...prefsOf(get()), sidebarPinned: !get().sidebarPinned })),
  toggleInsight: () =>
    set(persist({ ...prefsOf(get()), insightCollapsed: !get().insightCollapsed })),
  setDrawerOpen: (open) => set({ drawerOpen: open }),
  setInsightOverlayOpen: (open) => set({ insightOverlayOpen: open }),
}));

/** 상태에서 **저장 대상 두 필드만** 뽑는다. 드로어 열림이 localStorage 에 새는 것을 막는다. */
function prefsOf(state: ShellUiState): UiPrefs {
  return { sidebarPinned: state.sidebarPinned, insightCollapsed: state.insightCollapsed };
}
