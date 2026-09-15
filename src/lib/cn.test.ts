import { describe, expect, it } from 'vitest';

import { cn } from '@/lib/cn';

describe('cn', () => {
  it('falsy 값을 버리고 조건부 클래스를 합친다', () => {
    expect(cn('a', false && 'b', undefined, ['c', null], { d: true, e: false })).toBe('a c d');
  });

  it('같은 속성의 Tailwind 유틸은 뒤에 온 것이 이긴다', () => {
    expect(cn('px-2 text-sm', 'px-4')).toBe('text-sm px-4');
  });

  it('인자가 없으면 빈 문자열', () => {
    expect(cn()).toBe('');
  });
});
