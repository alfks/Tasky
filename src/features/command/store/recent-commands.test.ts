import { beforeEach, describe, expect, it } from 'vitest';

import {
  RECENT_COMMANDS_KEY,
  readRecentCommands,
  writeRecentCommands,
} from '@/features/command/store/recent-commands';

/** `localStorage` 를 그대로 쓰되 던지는 판도 만든다. */
function throwingStorage(): Storage {
  const fail = () => {
    throw new DOMException('QuotaExceededError');
  };
  return {
    get length() {
      return 0;
    },
    clear: fail,
    getItem: fail,
    key: fail,
    removeItem: fail,
    setItem: fail,
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('recent-commands (R12)', () => {
  it('쓴 것을 읽는다', () => {
    expect(writeRecentCommands(['a', 'b'], localStorage)).toBe(true);
    expect(readRecentCommands(localStorage)).toEqual(['a', 'b']);
    expect(localStorage.getItem(RECENT_COMMANDS_KEY)).toBe('["a","b"]');
  });

  it('5개를 넘겨 저장하면 잘린다', () => {
    writeRecentCommands(['a', 'b', 'c', 'd', 'e', 'f'], localStorage);
    expect(readRecentCommands(localStorage)).toHaveLength(5);
  });

  it('저장된 값이 없으면 빈 목록이다', () => {
    expect(readRecentCommands(localStorage)).toEqual([]);
  });

  it('깨진 JSON·잘못된 모양을 빈 목록으로 본다', () => {
    localStorage.setItem(RECENT_COMMANDS_KEY, '{');
    expect(readRecentCommands(localStorage)).toEqual([]);
    localStorage.setItem(RECENT_COMMANDS_KEY, '{"a":1}');
    expect(readRecentCommands(localStorage)).toEqual([]);
    localStorage.setItem(RECENT_COMMANDS_KEY, '["a",3,null,"b"]');
    expect(readRecentCommands(localStorage)).toEqual(['a', 'b']);
  });

  it('저장소가 던져도 앱은 계속 돈다', () => {
    const storage = throwingStorage();
    expect(readRecentCommands(storage)).toEqual([]);
    expect(writeRecentCommands(['a'], storage)).toBe(false);
  });

  it('저장소가 없으면 조용히 비운다', () => {
    expect(readRecentCommands(null)).toEqual([]);
    expect(writeRecentCommands(['a'], null)).toBe(false);
  });
});
