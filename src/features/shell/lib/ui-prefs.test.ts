// 접힘 상태의 기기별 저장 (app-shell.md R5).
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_UI_PREFS,
  UI_PREFS_KEY,
  readUiPrefs,
  writeUiPrefs,
} from '@/features/shell/lib/ui-prefs';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('readUiPrefs', () => {
  it('저장된 값을 읽는다', () => {
    window.localStorage.setItem(
      UI_PREFS_KEY,
      JSON.stringify({ sidebarCollapsed: true, insightCollapsed: false }),
    );
    expect(readUiPrefs()).toEqual({ sidebarCollapsed: true, insightCollapsed: false });
  });

  it('값이 없으면 기본값', () => {
    expect(readUiPrefs()).toEqual(DEFAULT_UI_PREFS);
  });

  it('깨진 JSON·이상한 타입은 기본값으로 떨어진다', () => {
    window.localStorage.setItem(UI_PREFS_KEY, '{not json');
    expect(readUiPrefs()).toEqual(DEFAULT_UI_PREFS);
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ sidebarCollapsed: 'yes' }));
    expect(readUiPrefs()).toEqual(DEFAULT_UI_PREFS);
  });

  it('localStorage 접근 자체가 throw 해도(사생활 보호 모드) 기본값으로 산다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readUiPrefs()).toEqual(DEFAULT_UI_PREFS);
  });
});

describe('writeUiPrefs', () => {
  it('두 필드만 저장한다', () => {
    writeUiPrefs({ sidebarCollapsed: true, insightCollapsed: true });
    expect(JSON.parse(window.localStorage.getItem(UI_PREFS_KEY) ?? '{}')).toEqual({
      sidebarCollapsed: true,
      insightCollapsed: true,
    });
  });

  it('저장 실패는 조용히 넘긴다 — 화면은 계속 돈다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeUiPrefs(DEFAULT_UI_PREFS)).not.toThrow();
  });
});
