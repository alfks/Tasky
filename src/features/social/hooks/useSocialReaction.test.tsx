import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setSocialRepository } from '@/repositories/container';
import type { SocialRepository } from '@/repositories/social-repository';

import { useSocialReaction } from '@/features/social/hooks/useSocialReaction';
import {
  activateSocialSession,
  configureSocialVerifier,
  deactivateSocialSession,
  invalidateSocialSession,
  resetSocialSessionForTest,
} from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

const POST = 'a'.repeat(32);
const initial = useSocialStore.getState();

describe('응원 이후 초점 의도와 세션 세대', () => {
  beforeEach(async () => {
    resetSocialSessionForTest();
    configureSocialVerifier(async () => 'actor-a');
    await activateSocialSession();
  });
  afterEach(() => {
    act(() => {
      deactivateSocialSession();
      resetSocialSessionForTest();
      useSocialStore.setState(initial);
    });
  });

  it('정상 명령과 자체 재조회 뒤에만 초점 의도를 확정한다', async () => {
    const refreshCurrent = vi.fn(async () => {});
    act(() => useSocialStore.setState({ refreshCurrent }));
    setSocialRepository({
      setReaction: vi.fn(async () => ({ data: { postId: POST, active: true }, serverTime: 1 })),
    } as unknown as SocialRepository);
    const focus = { begin: vi.fn(), committed: vi.fn(), cancel: vi.fn() };
    const { result } = renderHook(() => useSocialReaction(focus));
    await act(async () => expect(await result.current.setReaction(POST, true)).toBe(true));
    expect(refreshCurrent).toHaveBeenCalledOnce();
    expect(focus.committed).toHaveBeenCalledOnce();
    expect(focus.cancel).not.toHaveBeenCalled();
  });

  it('서버 응답 또는 재조회 중 무효화된 이전 세션은 초점을 움직이지 않는다', async () => {
    const focus = { begin: vi.fn(), committed: vi.fn(), cancel: vi.fn() };
    const refreshCurrent = vi.fn(async () => invalidateSocialSession('recheck'));
    act(() => useSocialStore.setState({ refreshCurrent }));
    setSocialRepository({
      setReaction: vi.fn(async () => ({ data: { postId: POST, active: true }, serverTime: 1 })),
    } as unknown as SocialRepository);
    const { result } = renderHook(() => useSocialReaction(focus));
    await act(async () => expect(await result.current.setReaction(POST, true)).toBe(false));
    expect(focus.cancel).toHaveBeenCalledOnce();
    expect(focus.committed).not.toHaveBeenCalled();
    expect(result.current.busyId).toBeNull();
  });
});
