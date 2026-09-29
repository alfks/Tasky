// 보기 모드의 기기별 저장 (date-strip.md R14 — 보기만 기억하고 선택 날짜는 기억하지 않는다).
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DEFAULT_VIEW,
  VIEW_PREF_KEY,
  readViewPref,
  writeViewPref,
} from '@/features/date-strip/lib/view-pref';

afterEach(() => {
  window.localStorage.clear();
  vi.restoreAllMocks();
});

describe('R14. 보기 모드는 기기별로 기억한다', () => {
  it('키는 tasky.datestrip.v1 하나다', () => {
    expect(VIEW_PREF_KEY).toBe('tasky.datestrip.v1');
  });

  it('쓴 값을 그대로 읽는다(왕복)', () => {
    writeViewPref('month');
    expect(readViewPref()).toBe('month');
    writeViewPref('week');
    expect(readViewPref()).toBe('week');
  });

  it('저장된 모양은 { view } 하나다 — 선택 날짜 같은 다른 필드를 쓰지 않는다(R2)', () => {
    writeViewPref('month');
    expect(JSON.parse(window.localStorage.getItem(VIEW_PREF_KEY) ?? 'null')).toEqual({
      view: 'month',
    });
    expect(Object.keys(window.localStorage)).toEqual([VIEW_PREF_KEY]);
  });

  it('값이 없으면 주 보기다', () => {
    expect(readViewPref()).toBe('week');
    expect(DEFAULT_VIEW).toBe('week');
  });

  it('쓰레기 값은 주 보기로 떨어진다 — 깨진 JSON·다른 타입·모르는 보기 이름', () => {
    window.localStorage.setItem(VIEW_PREF_KEY, '{not json');
    expect(readViewPref()).toBe('week');
    window.localStorage.setItem(VIEW_PREF_KEY, JSON.stringify('month'));
    expect(readViewPref()).toBe('week');
    window.localStorage.setItem(VIEW_PREF_KEY, JSON.stringify({ view: 'year' }));
    expect(readViewPref()).toBe('week');
    window.localStorage.setItem(VIEW_PREF_KEY, JSON.stringify({ view: 1 }));
    expect(readViewPref()).toBe('week');
    window.localStorage.setItem(VIEW_PREF_KEY, 'null');
    expect(readViewPref()).toBe('week');
  });

  it('getItem 이 throw 해도(사생활 보호 모드) 주 보기다', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readViewPref()).toBe('week');
  });

  it('setItem 이 throw 해도 앱이 죽지 않는다', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('quota');
    });
    expect(() => writeViewPref('month')).not.toThrow();
  });
});
