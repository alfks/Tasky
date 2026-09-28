import { act, render, renderHook, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SocialResponse } from '@/domain/social/social';

import { setSocialRepository } from '@/repositories/container';
import type { SocialRepository } from '@/repositories/social-repository';

import { SocialMyReactionsPanel } from '@/features/social/components/SocialMyReactionsPanel';
import { useMyReactions } from '@/features/social/hooks/useMyReactions';
import {
  activateSocialSession,
  configureSocialVerifier,
  deactivateSocialSession,
  invalidateSocialSession,
  resetSocialSessionForTest,
} from '@/features/social/session-lifecycle';

const POST = 'a'.repeat(32);
const NOW = 1_800_000_000_000;

function response<T>(data: T): SocialResponse<T> {
  return { data, serverTime: NOW };
}

describe('보낸 응원 off 자기 관리', () => {
  beforeEach(async () => {
    resetSocialSessionForTest();
    configureSocialVerifier(async () => 'actor-a');
    await activateSocialSession();
  });
  afterEach(() => {
    act(() => {
      deactivateSocialSession();
      resetSocialSessionForTest();
    });
  });

  it('본문 없이 목록을 읽고 확인된 취소 후 재조회한다', async () => {
    const myReactions = vi
      .fn()
      .mockResolvedValueOnce(
        response({ items: [{ postId: POST, createdAt: NOW }], nextCursor: null }),
      )
      .mockResolvedValueOnce(response({ items: [], nextCursor: null }));
    const setReaction = vi.fn(async () => response({ postId: POST, active: false }));
    setSocialRepository({ myReactions, setReaction } as unknown as SocialRepository);
    const { result, rerender } = renderHook(() => useMyReactions(true));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    const refresh = result.current.refresh;
    rerender();
    expect(result.current.refresh).toBe(refresh);
    expect(result.current.items).toEqual([{ postId: POST, createdAt: NOW }]);
    await act(async () => {
      expect(await result.current.cancel(POST)).toBe(true);
    });
    expect(setReaction).toHaveBeenCalledWith(
      { postId: POST, active: false },
      expect.objectContaining({ key: expect.any(String) }),
    );
    expect(result.current.items).toEqual([]);
    expect(myReactions).toHaveBeenCalledTimes(2);
  });

  it('응답 불명이면 같은 본문 재시도에 같은 멱등 key를 쓴다', async () => {
    const myReactions = vi.fn(async () =>
      response({ items: [{ postId: POST, createdAt: NOW }], nextCursor: null }),
    );
    const setReaction = vi
      .fn()
      .mockRejectedValueOnce(new Error('transport'))
      .mockResolvedValueOnce(response({ postId: POST, active: false }));
    setSocialRepository({ myReactions, setReaction } as unknown as SocialRepository);
    const { result } = renderHook(() => useMyReactions(true));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    await act(async () => {
      expect(await result.current.cancel(POST)).toBe(false);
    });
    const firstKey = setReaction.mock.calls[0][1].key;
    expect(result.current.error).toContain('완료 여부');
    await act(async () => {
      expect(await result.current.cancel(POST)).toBe(true);
    });
    expect(setReaction.mock.calls[1][1].key).toBe(firstKey);
  });

  it('상위 새로고침은 한 번만 재조회하고 상태 렌더로 반복되지 않는다', async () => {
    const myReactions = vi.fn(async () => response({ items: [], nextCursor: null }));
    setSocialRepository({ myReactions } as unknown as SocialRepository);
    render(<SocialMyReactionsPanel enabled refreshNonce={1} />);
    await waitFor(() => expect(screen.getByText('아직 보낸 응원이 없어요.')).toBeInTheDocument());
    expect(myReactions).toHaveBeenCalledTimes(2);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(myReactions).toHaveBeenCalledTimes(2);
  });

  it('429 Retry-After 동안 조회 행동을 잠그고 즉시 재전송하지 않는다', async () => {
    const limited = Object.assign(new Error('limited'), { code: 'rate-limited', retryAfter: 7 });
    const myReactions = vi.fn().mockRejectedValueOnce(limited);
    setSocialRepository({ myReactions } as unknown as SocialRepository);
    render(<SocialMyReactionsPanel enabled refreshNonce={0} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('7초'));
    expect(screen.getByRole('button', { name: '응원 목록 새로고침' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '다시 시도' })).toBeDisabled();
    expect(myReactions).toHaveBeenCalledTimes(1);
  });

  it('만료된 cursor는 명시적 첫 페이지 재시도에서 버린다', async () => {
    const expired = Object.assign(new Error('expired'), { code: 'validation' });
    const myReactions = vi
      .fn()
      .mockResolvedValueOnce(response({ items: [], nextCursor: 'cursor' }))
      .mockRejectedValueOnce(expired)
      .mockResolvedValueOnce(response({ items: [], nextCursor: null }));
    setSocialRepository({ myReactions } as unknown as SocialRepository);
    const { result } = renderHook(() => useMyReactions(true));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    await act(async () => {
      expect(await result.current.next()).toBe(false);
    });
    expect(result.current.cursorExpired).toBe(true);
    await act(async () => {
      expect(await result.current.retry()).toBe(true);
    });
    expect(myReactions.mock.calls[1][0]).toEqual({ cursor: 'cursor' });
    expect(myReactions.mock.calls[2][0]).toBeUndefined();
    expect(result.current.pageIndex).toBe(0);
  });

  it('응원 철회 도중 세션이 무효화되면 이전 화면 성공 후속 동작을 중단한다', async () => {
    const myReactions = vi.fn(async () =>
      response({ items: [{ postId: POST, createdAt: NOW }], nextCursor: null }),
    );
    const setReaction = vi.fn(async () => {
      invalidateSocialSession('account');
      return response({ postId: POST, active: false });
    });
    setSocialRepository({ myReactions, setReaction } as unknown as SocialRepository);
    const { result } = renderHook(() => useMyReactions(true));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    await act(async () => {
      expect(await result.current.cancel(POST)).toBe(false);
    });
    expect(myReactions).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe('idle');
  });
});
