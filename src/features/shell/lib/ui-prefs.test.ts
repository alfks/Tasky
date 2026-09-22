// 접힘 상태의 기기별 저장 (app-shell.md R5, calendar-layout.md R23 — v1 → v2, 마이그레이션 없음).
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
  it('v2 키를 쓴다', () => {
    expect(UI_PREFS_KEY).toBe('tasky.ui.v2');
  });

  it('저장된 값을 읽는다', () => {
    window.localStorage.setItem(
      UI_PREFS_KEY,
      JSON.stringify({ sidebarPinned: true, insightCollapsed: false }),
    );
    expect(readUiPrefs()).toEqual({ sidebarPinned: true, insightCollapsed: false });
  });

  it('값이 없으면 기본값 — sidebarPinned 기본은 false(드로어가 기본)', () => {
    expect(readUiPrefs()).toEqual(DEFAULT_UI_PREFS);
    expect(DEFAULT_UI_PREFS.sidebarPinned).toBe(false);
  });

  it('깨진 JSON·이상한 타입은 기본값으로 떨어진다', () => {
    window.localStorage.setItem(UI_PREFS_KEY, '{not json');
    expect(readUiPrefs()).toEqual(DEFAULT_UI_PREFS);
    window.localStorage.setItem(UI_PREFS_KEY, JSON.stringify({ sidebarPinned: 'yes' }));
    expect(readUiPrefs()).toEqual(DEFAULT_UI_PREFS);
  });

  it(
    'v1(tasky.ui.v1) 값이 남아 있어도 무시한다 — 값의 뜻이 반대라 옮기지 않는다 ' +
      '(calendar-layout.md R23)',
    () => {
      window.localStorage.setItem(
        'tasky.ui.v1',
        JSON.stringify({ sidebarCollapsed: true, insightCollapsed: true }),
      );
      // v1 은 다른 키다 — v2 를 읽는 readUiPrefs 는 그 값을 절대 보지 않는다.
      expect(readUiPrefs()).toEqual(DEFAULT_UI_PREFS);
    },
  );

  it('localStorage 접근 자체가 throw 해도(사생활 보호 모드) 기본값으로 산다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readUiPrefs()).toEqual(DEFAULT_UI_PREFS);
  });
});

describe('writeUiPrefs', () => {
  it('두 필드만 저장한다', () => {
    writeUiPrefs({ sidebarPinned: true, insightCollapsed: true });
    expect(JSON.parse(window.localStorage.getItem(UI_PREFS_KEY) ?? '{}')).toEqual({
      sidebarPinned: true,
      insightCollapsed: true,
    });
  });

  it('v1 키에는 쓰지 않는다', () => {
    writeUiPrefs({ sidebarPinned: true, insightCollapsed: true });
    expect(window.localStorage.getItem('tasky.ui.v1')).toBeNull();
  });

  it('저장 실패는 조용히 넘긴다 — 화면은 계속 돈다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeUiPrefs(DEFAULT_UI_PREFS)).not.toThrow();
  });
});
