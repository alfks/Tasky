import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  clearPendingInvite,
  INVITE_STORAGE_KEY,
  pendingInviteToken,
} from '@/features/social/lib/invite-fragment';

beforeEach(() => {
  sessionStorage.clear();
  vi.useRealTimers();
});
describe('초대 로그인 왕복 원문', () => {
  it('24시간 만료와 손상 원문을 남기지 않는다', () => {
    sessionStorage.setItem(
      INVITE_STORAGE_KEY,
      JSON.stringify({ token: 'a'.repeat(64), savedAt: Date.now() - 24 * 60 * 60 * 1000 }),
    );
    expect(pendingInviteToken()).toBeNull();
    expect(sessionStorage.getItem(INVITE_STORAGE_KEY)).toBeNull();
    sessionStorage.setItem(INVITE_STORAGE_KEY, '{broken');
    expect(pendingInviteToken()).toBeNull();
    expect(sessionStorage.getItem(INVITE_STORAGE_KEY)).toBeNull();
  });
  it('사용과 취소 뒤 원문을 지운다', () => {
    sessionStorage.setItem(
      INVITE_STORAGE_KEY,
      JSON.stringify({ token: 'a'.repeat(64), savedAt: Date.now() }),
    );
    expect(pendingInviteToken()).toBe('a'.repeat(64));
    clearPendingInvite();
    expect(pendingInviteToken()).toBeNull();
  });
});
