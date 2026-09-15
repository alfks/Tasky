import { describe, expect, it } from 'vitest';

import { newId } from '@/lib/id';

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('newId', () => {
  it('UUID v4 형식 문자열을 돌려준다', () => {
    expect(newId()).toMatch(UUID_V4);
  });

  it('호출할 때마다 다른 값을 돌려준다', () => {
    expect(newId()).not.toBe(newId());
  });

  it('1000개를 생성해도 충돌이 없다', () => {
    const ids = new Set(Array.from({ length: 1000 }, () => newId()));
    expect(ids.size).toBe(1000);
  });
});
