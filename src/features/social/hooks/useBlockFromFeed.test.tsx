import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SocialResponse } from '@/domain/social/social';

import { setSocialRepository } from '@/repositories/container';
import type { SocialRepository } from '@/repositories/social-repository';

import { useBlockFromFeed } from '@/features/social/hooks/useBlockFromFeed';
import {
  activateSocialSession,
  configureSocialVerifier,
  deactivateSocialSession,
  invalidateSocialSession,
  resetSocialSessionForTest,
} from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

const NOW = 1_800_000_000_000;
const PEER = 'b'.repeat(32);
const refreshOriginal = useSocialStore.getState().refreshCurrent;
const keyForOriginal = useSocialStore.getState().keyFor;
const forgetKeyOriginal = useSocialStore.getState().forgetKey;

function response<T>(data: T): SocialResponse<T> {
  return { data, serverTime: NOW };
}

describe('피드에서 차단 후 지연 새로고침과 세션 경계', () => {
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

  it('refreshCurrent 대기 중 계정 무효화되면 오래된 성공으로 확인창을 닫지 않는다', async () => {
    let resolve: () => void = () => {
      throw new Error('미설정');
    };
    const refreshCurrent = vi.fn(
      () =>
        new Promise<void>((done) => {
          resolve = done;
        }),
    );
    const setBlock = vi.fn(async () => response({ peerId: PEER, blocked: true }));
    setSocialRepository({ setBlock } as unknown as SocialRepository);
    useSocialStore.setState({
      refreshCurrent,
      keyFor: () => 'test-key',
      forgetKey: () => {},
    });
    const { result } = renderHook(() => useBlockFromFeed());

    let pending!: Promise<boolean>;
    act(() => {
      pending = result.current.block(PEER);
    });
    await waitFor(() => expect(refreshCurrent).toHaveBeenCalledTimes(1));
    act(() => invalidateSocialSession('account'));
    await act(async () => {
      resolve();
      expect(await pending).toBe(false);
    });
    expect(result.current.error).toBeNull();
    expect(result.current.busy).toBe(false);
    expect(setBlock).toHaveBeenCalledTimes(1);
  });
});
