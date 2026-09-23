// 고정/드로어 상태 (app-shell.md R5·R7, calendar-layout.md R23~R24).
import { beforeEach, describe, expect, it } from 'vitest';

import { UI_PREFS_KEY, readUiPrefs } from '@/features/shell/lib/ui-prefs';
import { useShellUiStore } from '@/features/shell/store/shell-ui-store';

beforeEach(() => {
  window.localStorage.clear();
  useShellUiStore.setState({
    sidebarPinned: false,
    insightCollapsed: false,
    drawerOpen: false,
    insightOverlayOpen: false,
  });
});

describe('고정/접힘 상태', () => {
  it('기본값은 고정되지 않은 상태다 (calendar-layout.md R23 — 드로어가 기본)', () => {
    expect(useShellUiStore.getState().sidebarPinned).toBe(false);
  });

  it('사이드바 고정을 토글하면 localStorage 에 남는다', () => {
    useShellUiStore.getState().toggleSidebarPinned();
    expect(useShellUiStore.getState().sidebarPinned).toBe(true);
    expect(readUiPrefs().sidebarPinned).toBe(true);
  });

  it('다시 토글하면 고정이 풀린다', () => {
    useShellUiStore.getState().toggleSidebarPinned();
    useShellUiStore.getState().toggleSidebarPinned();
    expect(useShellUiStore.getState().sidebarPinned).toBe(false);
    expect(readUiPrefs().sidebarPinned).toBe(false);
  });

  it('인사이트 접힘도 따로 남는다', () => {
    useShellUiStore.getState().toggleInsight();
    expect(readUiPrefs()).toEqual({ sidebarPinned: false, insightCollapsed: true });
  });

  it('드로어 열림은 저장되지 않는다 — 세션 안에서만 산다 (R5 는 고정 여부만 기억한다)', () => {
    useShellUiStore.getState().setDrawerOpen(true);
    useShellUiStore.getState().toggleSidebarPinned();
    expect(Object.keys(JSON.parse(window.localStorage.getItem(UI_PREFS_KEY) ?? '{}'))).toEqual([
      'sidebarPinned',
      'insightCollapsed',
    ]);
  });

  it('오버레이 열림도 저장되지 않는다', () => {
    useShellUiStore.getState().setInsightOverlayOpen(true);
    useShellUiStore.getState().toggleInsight();
    expect(readUiPrefs().insightCollapsed).toBe(true);
    expect(useShellUiStore.getState().insightOverlayOpen).toBe(true);
  });
});
