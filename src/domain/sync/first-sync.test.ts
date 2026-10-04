import { describe, expect, it } from 'vitest';

import { canSeedLocally } from '@/domain/sync/first-sync';

describe('canSeedLocally', () => {
  it('상태가 없으면 시드해도 된다', () => {
    expect(canSeedLocally(undefined)).toBe(true);
  });
  it('로그인 전(userSub 없음)이면 시드해도 된다', () => {
    expect(canSeedLocally({})).toBe(true);
  });
  it('로그인됐고 첫 동기화 전이면 시드하지 않는다', () => {
    expect(canSeedLocally({ userSub: 'u1' })).toBe(false);
  });
  it('로그인됐고 첫 동기화가 끝났으면 시드해도 된다', () => {
    expect(canSeedLocally({ userSub: 'u1', lastSyncedAt: '2026-01-01T00:00:00.000Z' })).toBe(true);
  });
});
