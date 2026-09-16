// 접힘/드로어 상태 (app-shell.md R5·R7).
import { beforeEach, describe, expect, it } from 'vitest';

import { UI_PREFS_KEY, readUiPrefs } from '@/features/shell/lib/ui-prefs';
import { useShellUiStore } from '@/features/shell/store/shell-ui-store';

beforeEach(() => {
  window.localStorage.clear();
  useShellUiStore.setState({
    sidebarCollapsed: false,
    insightCollapsed: false,
    drawerOpen: false,
    insightOverlayOpen: false,
  });
});

describe('접힘 상태', () => {
  it('토글하면 localStorage 에 남는다 (R5)', () => {
    useShellUiStore.getState().toggleSidebar();
    expect(useShellUiStore.getState().sidebarCollapsed).toBe(true);
    expect(readUiPrefs().sidebarCollapsed).toBe(true);
  });

  it('인사이트 접힘도 따로 남는다', () => {
    useShellUiStore.getState().toggleInsight();
    expect(readUiPrefs()).toEqual({ sidebarCollapsed: false, insightCollapsed: true });
  });

  it('드로어 열림은 저장되지 않는다 — 세션 안에서만 산다 (R5 는 접힘만 기억한다)', () => {
    useShellUiStore.getState().setDrawerOpen(true);
    useShellUiStore.getState().toggleSidebar();
    expect(Object.keys(JSON.parse(window.localStorage.getItem(UI_PREFS_KEY) ?? '{}'))).toEqual([
      'sidebarCollapsed',
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
