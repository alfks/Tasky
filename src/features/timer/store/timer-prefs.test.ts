// 기기별 설정 (timer R1·R9). 깨진 값이 들어와도 타이머가 뜨는지가 핵심이다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FOCUS_DEFAULT_MINUTES } from '@/domain/focus/focus-session.rules';

import {
  DEFAULT_TIMER_PREFS,
  TIMER_PREFS_KEY,
  parseTimerPrefs,
  readTimerPrefs,
  writeTimerPrefs,
} from '@/features/timer/store/timer-prefs';

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('저장 키 (R1)', () => {
  it('스펙이 못 박은 키 그대로다 — 바뀌면 기기에 기억된 설정이 통째로 사라진다', () => {
    expect(TIMER_PREFS_KEY).toBe('tasky.timer.v1');
  });
});

describe('parseTimerPrefs', () => {
  it('기본값은 25분·소리 켬이다', () => {
    expect(FOCUS_DEFAULT_MINUTES).toBe(25);
    expect(DEFAULT_TIMER_PREFS).toEqual({ minutes: 25, soundOff: false, pomodoro: false });
    expect(parseTimerPrefs(null)).toEqual({ minutes: 25, soundOff: false, pomodoro: false });
  });

  it('길이와 소리를 한 레코드에서 함께 읽는다 (R1·R9 가 같은 키)', () => {
    expect(parseTimerPrefs('{"minutes":50,"soundOff":true,"pomodoro":true}')).toEqual({
      minutes: 50,
      soundOff: true,
      pomodoro: true,
    });
    // 뽀모도로를 모르던 때에 적힌 레코드도 그대로 읽힌다 — 모드는 꺼진 것으로 본다(P1 기본값).
    expect(parseTimerPrefs('{"minutes":50,"soundOff":true}')).toEqual({
      minutes: 50,
      soundOff: true,
      pomodoro: false,
    });
  });

  it('JSON 이 아니거나 범위를 벗어난 길이는 기본값으로 떨어진다', () => {
    for (const raw of [
      '',
      '{',
      'null',
      '[]',
      '{"minutes":0}',
      '{"minutes":181}',
      '{"minutes":25.5}',
      '{"minutes":"25"}',
    ]) {
      expect(parseTimerPrefs(raw).minutes).toBe(25);
    }
    expect(parseTimerPrefs('{"minutes":1}').minutes).toBe(1);
    expect(parseTimerPrefs('{"minutes":180}').minutes).toBe(180);
  });

  it('soundOff 는 true 일 때만 참이다', () => {
    expect(parseTimerPrefs('{"soundOff":"yes"}').soundOff).toBe(false);
    expect(parseTimerPrefs('{"soundOff":1}').soundOff).toBe(false);
  });
});

describe('읽기·쓰기', () => {
  it('왕복한다', () => {
    writeTimerPrefs({ minutes: 45, soundOff: true, pomodoro: true });
    expect(localStorage.getItem(TIMER_PREFS_KEY)).toBe(
      '{"minutes":45,"soundOff":true,"pomodoro":true}',
    );
    expect(readTimerPrefs()).toEqual({ minutes: 45, soundOff: true, pomodoro: true });
  });

  it('저장소가 막혀 있어도 던지지 않는다 (사생활 보호 모드)', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(readTimerPrefs()).toEqual({ minutes: 25, soundOff: false, pomodoro: false });
    expect(() => writeTimerPrefs({ minutes: 50, soundOff: false, pomodoro: false })).not.toThrow();
  });
});
