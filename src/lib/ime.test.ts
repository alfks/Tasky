import { describe, expect, it } from 'vitest';

import { isImeKey } from '@/lib/ime';

const key = (init: KeyboardEventInit) => new KeyboardEvent('keydown', { key: 'Enter', ...init });

describe('isImeKey', () => {
  it('isComposing 과 keyCode 229 를 각각 조합 중으로 본다', () => {
    expect(isImeKey(key({ isComposing: true }))).toBe(true);
    expect(isImeKey(key({ keyCode: 229 }))).toBe(true);
  });

  it('조합과 무관한 키는 통과시킨다', () => {
    expect(isImeKey(key({}))).toBe(false);
    expect(isImeKey(key({ key: 'Escape', keyCode: 27 }))).toBe(false);
  });
});
