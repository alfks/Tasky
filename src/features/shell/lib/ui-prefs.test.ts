// 접힘 상태의 기기별 저장 (app-shell.md R5 — v1 → v2, insightCollapsed 만 반쪽 승계·v1 은 삭제).
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
    'v2 가 없고 v1(tasky.ui.v1) 이 있으면 insightCollapsed 만 승계하고 v1 키를 지운다 ' +
      '(리뷰 Minor — sidebarCollapsed 는 뜻이 반대라 승계하지 않는다)',
    () => {
      window.localStorage.setItem(
        'tasky.ui.v1',
        JSON.stringify({ sidebarCollapsed: true, insightCollapsed: true }),
      );
      expect(readUiPrefs()).toEqual({ sidebarPinned: false, insightCollapsed: true });
      // 옮긴 뒤에는 v1 자체가 없어야 한다 — 안 지우면 아무도 안 읽는 값이 영구히 남는다.
      expect(window.localStorage.getItem('tasky.ui.v1')).toBeNull();
    },
  );

  it('v1·v2 둘 다 없으면 기본값이고, v1 을 지우려 들지 않는다', () => {
    expect(readUiPrefs()).toEqual(DEFAULT_UI_PREFS);
    expect(window.localStorage.getItem('tasky.ui.v1')).toBeNull();
  });

  it('v1 이 깨진 JSON 이어도 기본값으로 떨어지고, v1 키는 지운다', () => {
    window.localStorage.setItem('tasky.ui.v1', '{not json');
    expect(readUiPrefs()).toEqual(DEFAULT_UI_PREFS);
    expect(window.localStorage.getItem('tasky.ui.v1')).toBeNull();
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
