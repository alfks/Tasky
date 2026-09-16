// DOM·localStorage 경계. 스토어 테스트가 이 함수들의 결과를 통해 화면을 확인하므로,
// 여기서는 "무엇을 쓰는가"와 "실패해도 던지지 않는가"를 직접 본다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  applyTheme,
  readMirror,
  readSystemDark,
  watchSystemDark,
  writeMirror,
} from '@/features/theme/store/theme-dom';
import { THEME_COLOR, THEME_MIRROR_KEY, toMirror } from '@/features/theme/store/theme-state';

type MediaListener = (event: MediaQueryListEvent) => void;

/** `matchMedia` 를 흉내 내고 change 이벤트를 손으로 쏠 수 있게 한다. */
function stubMatchMedia(initial: boolean) {
  const listeners = new Set<MediaListener>();
  const query = {
    matches: initial,
    media: '(prefers-color-scheme: dark)',
    addEventListener: (_type: string, fn: MediaListener) => listeners.add(fn),
    removeEventListener: (_type: string, fn: MediaListener) => listeners.delete(fn),
  };
  vi.stubGlobal('matchMedia', () => query as unknown as MediaQueryList);
  return {
    listenerCount: () => listeners.size,
    emit: (matches: boolean) => {
      query.matches = matches;
      for (const fn of listeners) fn({ matches } as MediaQueryListEvent);
    },
  };
}

beforeEach(() => {
  window.localStorage.clear();
  document.head.innerHTML = '<meta name="theme-color" content="#FAFAFC">';
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('applyTheme', () => {
  it('data-theme·color-scheme·강조색·theme-color 를 함께 쓴다', () => {
    applyTheme({ resolved: 'dark', accent: '#E27A8E' });
    const el = document.documentElement;
    expect(el.getAttribute('data-theme')).toBe('dark');
    expect(el.style.getPropertyValue('color-scheme')).toBe('dark');
    expect(el.style.getPropertyValue('--color-accent')).toBe('#E27A8E');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      THEME_COLOR.dark,
    );
  });

  it('다시 부르면 이전 값을 덮는다(라이트로 되돌아간다)', () => {
    applyTheme({ resolved: 'dark', accent: '#E27A8E' });
    applyTheme({ resolved: 'light', accent: '#FF8FA3' });
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      THEME_COLOR.light,
    );
  });

  it('theme-color 메타가 없어도 던지지 않는다', () => {
    document.head.innerHTML = '';
    expect(() => applyTheme({ resolved: 'dark', accent: '#E27A8E' })).not.toThrow();
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

describe('readSystemDark / watchSystemDark (R7)', () => {
  it('OS 선호를 그대로 읽는다 — 양방향', () => {
    stubMatchMedia(true);
    expect(readSystemDark()).toBe(true);
    stubMatchMedia(false);
    expect(readSystemDark()).toBe(false);
  });

  it('matchMedia 가 없으면 라이트로 본다', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(readSystemDark()).toBe(false);
  });

  it('OS 변경을 알리고, 해지하면 더 이상 알리지 않는다', () => {
    const media = stubMatchMedia(false);
    const seen: boolean[] = [];
    const stop = watchSystemDark((dark) => seen.push(dark));
    media.emit(true);
    media.emit(false);
    expect(seen).toEqual([true, false]);
    expect(media.listenerCount()).toBe(1);
    stop();
    media.emit(true);
    expect(seen).toEqual([true, false]);
    expect(media.listenerCount()).toBe(0);
  });

  it('matchMedia 가 없으면 구독은 조용히 no-op 이다', () => {
    vi.stubGlobal('matchMedia', undefined);
    const stop = watchSystemDark(() => expect.unreachable('불릴 수 없다'));
    expect(() => stop()).not.toThrow();
  });
});

describe('미러 읽기·쓰기 (R6·R8)', () => {
  it('쓴 값을 그대로 읽는다', () => {
    const mirror = toMirror('dark', '#FF8FA3');
    writeMirror(mirror);
    expect(window.localStorage.getItem(THEME_MIRROR_KEY)).toBe(JSON.stringify(mirror));
    expect(readMirror()).toEqual(mirror);
  });

  it('없거나 손상된 값은 undefined 다', () => {
    expect(readMirror()).toBeUndefined();
    window.localStorage.setItem(THEME_MIRROR_KEY, '{');
    expect(readMirror()).toBeUndefined();
  });

  it('localStorage 가 막혀도 던지지 않는다(읽기·쓰기 둘 다)', () => {
    const read = vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(readMirror()).toBeUndefined();
    expect(() => writeMirror(toMirror('light', '#FF8FA3'))).not.toThrow();
    read.mockRestore();
    write.mockRestore();
  });
});
