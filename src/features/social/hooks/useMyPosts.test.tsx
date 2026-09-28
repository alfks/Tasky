import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SocialResponse } from '@/domain/social/social';

import { setSocialRepository } from '@/repositories/container';
import type { SocialRepository } from '@/repositories/social-repository';

import { useMyPosts } from '@/features/social/hooks/useMyPosts';
import {
  activateSocialSession,
  configureSocialVerifier,
  deactivateSocialSession,
  invalidateSocialSession,
  resetSocialSessionForTest,
} from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

const NOW = 1_800_000_000_000;
const POST = 'a'.repeat(32);
const refreshOriginal = useSocialStore.getState().refreshCurrent;
const keyForOriginal = useSocialStore.getState().keyFor;
const forgetKeyOriginal = useSocialStore.getState().forgetKey;

function response<T>(data: T): SocialResponse<T> {
  return { data, serverTime: NOW };
}

function deferred() {
  let resolve: () => void = () => {
    throw new Error('미설정');
  };
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve: () => resolve() };
}

describe('내 공유 변경 후 지연 새로고침과 세션 경계', () => {
  beforeEach(async () => {
    resetSocialSessionForTest();
    configureSocialVerifier(async () => 'actor-a');
    await activateSocialSession();
  });
  afterEach(() => {
    act(() => {
      deactivateSocialSession();
      resetSocialSessionForTest();
      useSocialStore.setState({
        refreshCurrent: refreshOriginal,
        keyFor: keyForOriginal,
        forgetKey: forgetKeyOriginal,
      });
    });
  });

  for (const kind of ['create', 'remove'] as const) {
    it(`${kind} 뒤 refreshFeed 대기 중 무효화되면 이전 성공을 새 화면에 적용하지 않는다`, async () => {
      const refresh = deferred();
      const refreshCurrent = vi.fn(() => refresh.promise);
      const createPost = vi.fn(async () => response({ id: POST }));
      const deletePost = vi.fn(async () => response({ id: POST }));
      setSocialRepository({
        me: vi.fn(async () => response({ mode: 'enabled', profile: null })),
        myPosts: vi.fn(async () => response({ items: [], nextCursor: null })),
        friends: vi.fn(async () => response({ items: [], nextCursor: null })),
        createPost,
        deletePost,
      } as unknown as SocialRepository);
      useSocialStore.setState({
        refreshCurrent,
        keyFor: () => 'test-key',
        forgetKey: () => {},
      });
      const { result } = renderHook(() => useMyPosts(true));
      await waitFor(() => expect(result.current.phase).toBe('ready'));

      let pending!: Promise<boolean>;
      act(() => {
        pending =
          kind === 'create'
            ? result.current.create({ text: '공유할 문장', happenedOn: '2026-09-28' })
            : result.current.remove(POST);
      });
      await waitFor(() => expect(refreshCurrent).toHaveBeenCalledTimes(1));
      act(() => invalidateSocialSession('account'));
      await act(async () => {
        refresh.resolve();
        expect(await pending).toBe(false);
      });
      expect(result.current.message).toBeNull();
      expect(result.current.busy).toBe(false);
      expect(kind === 'create' ? createPost : deletePost).toHaveBeenCalledTimes(1);
    });
  }
});
