import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { SocialResponse } from '@/domain/social/social';

import { setSocialRepository } from '@/repositories/container';
import type { SocialRepository } from '@/repositories/social-repository';

import { useSocialRelations } from '@/features/social/hooks/useSocialRelations';
import {
  activateSocialSession,
  configureSocialVerifier,
  deactivateSocialSession,
  invalidateSocialSession,
  resetSocialSessionForTest,
} from '@/features/social/session-lifecycle';

const TOKEN = 'a'.repeat(64);
const PEER = 'b'.repeat(32);
const RESPONSE_TIME = 1_780_000_000_000;

function response<T>(data: T): SocialResponse<T> {
  return { data, serverTime: RESPONSE_TIME };
}

function repository() {
  const sendRequest = vi.fn(async () => response({ peerId: PEER, pairVersion: 1 }));
  const renameProfile = vi.fn(async () => response({ id: 'c'.repeat(32), version: 2 }));
  const previewInvite = vi.fn(async (_input: { token: string }) =>
    response({ nickname: '초대자', expiresAt: RESPONSE_TIME }),
  );
  const api = {
    me: vi.fn(async () =>
      response({ mode: 'enabled', profile: { id: 'c'.repeat(32), nickname: '나', version: 1 } }),
    ),
    friends: vi.fn(async (): ReturnType<SocialRepository['friends']> =>
      response({ items: [], nextCursor: null }),
    ),
    requests: vi.fn(async () => response({ items: [], nextCursor: null })),
    invites: vi.fn(async () => response({ items: [], nextCursor: null })),
    blocks: vi.fn(async () => response({ items: [], nextCursor: null })),
    sendRequest,
    renameProfile,
    previewInvite,
  };
  setSocialRepository(api as unknown as SocialRepository);
  return api;
}

describe('친구 관계 hook의 명시 행동과 세대', () => {
  beforeEach(async () => {
    resetSocialSessionForTest();
    configureSocialVerifier(async () => 'actor-a');
    await activateSocialSession();
  });
  afterEach(() => {
    deactivateSocialSession();
    resetSocialSessionForTest();
  });

  it('초대 화면을 읽기만 해서는 요청하지 않고 명시 행동 뒤 한 번만 보낸다', async () => {
    const api = repository();
    const { result } = renderHook(() => useSocialRelations(true));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(api.sendRequest).not.toHaveBeenCalled();

    await act(async () => {
      expect(await result.current.request(TOKEN)).toBe(true);
    });
    expect(api.sendRequest).toHaveBeenCalledTimes(1);
    expect(api.sendRequest).toHaveBeenCalledWith(
      { token: TOKEN },
      expect.objectContaining({ key: expect.any(String) }),
    );
  });

  it('계정 교체 뒤 도착한 요청 성공을 새 화면에 적용하지 않는다', async () => {
    const api = repository();
    let resolve: (value: SocialResponse<{ peerId: string; pairVersion: number }>) => void = () => {
      throw new Error('미설정');
    };
    api.sendRequest.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { result } = renderHook(() => useSocialRelations(true));
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    let pending: Promise<boolean> = Promise.resolve(false);
    act(() => {
      pending = result.current.request(TOKEN);
    });
    act(() => invalidateSocialSession('account'));
    await act(async () => {
      resolve(response({ peerId: PEER, pairVersion: 1 }));
      expect(await pending).toBe(false);
    });
    expect(result.current.data.me).toBeNull();
    expect(result.current.busy).toBe(false);
  });

  it('탭을 떠난 뒤 같은 세션의 늦은 성공은 새 화면 초점 의도를 살리지 않는다', async () => {
    const api = repository();
    let resolve: (value: SocialResponse<{ peerId: string; pairVersion: number }>) => void = () => {
      throw new Error('미설정');
    };
    api.sendRequest.mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const { result, unmount } = renderHook(() => useSocialRelations(true));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    const valid = result.current.captureView();
    let pending: Promise<boolean> = Promise.resolve(false);
    act(() => {
      pending = result.current.request(TOKEN);
      unmount();
    });
    await act(async () => {
      resolve(response({ peerId: PEER, pairVersion: 1 }));
      expect(await pending).toBe(false);
    });
    expect(valid()).toBe(false);
    expect(api.me).toHaveBeenCalledTimes(1);
  });

  it('버전 충돌은 낡은 관계 행을 다시 읽고 사용자에게 재결정을 요구한다', async () => {
    const api = repository();
    api.renameProfile.mockRejectedValue(Object.assign(new Error('conflict'), { code: 'conflict' }));
    const { result } = renderHook(() => useSocialRelations(true));
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    await act(async () => {
      expect(await result.current.rename('새 별명')).toBe(false);
    });
    expect(api.me).toHaveBeenCalledTimes(2);
    expect(result.current.phase).toBe('ready');
    expect(result.current.busy).toBe(false);
    expect(result.current.error).toContain('목록을 새로 확인');
  });

  it('429는 서버 retryAfter를 다음 행동으로 표시한다', async () => {
    const api = repository();
    api.sendRequest.mockRejectedValue(
      Object.assign(new Error('rate-limited'), { code: 'rate-limited', retryAfter: 7 }),
    );
    const { result } = renderHook(() => useSocialRelations(true));
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    await act(async () => {
      expect(await result.current.request(TOKEN)).toBe(false);
    });
    expect(result.current.error).toContain('7초 뒤');
  });

  it('관계 목록의 다음 커서를 명시적으로 읽고 기존 행을 유지한다', async () => {
    const api = repository();
    const first = { id: PEER, nickname: '첫 친구', pairVersion: 1 };
    const second = { id: 'd'.repeat(32), nickname: '다음 친구', pairVersion: 2 };
    api.friends
      .mockResolvedValueOnce(response({ items: [first], nextCursor: 'next' }))
      .mockResolvedValueOnce(response({ items: [second], nextCursor: null }));
    const { result } = renderHook(() => useSocialRelations(true));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    expect(result.current.data.next.friends).toBe('next');

    await act(async () => {
      await result.current.loadMore('friends');
    });
    expect(api.friends).toHaveBeenLastCalledWith({ cursor: 'next' });
    expect(result.current.data.friends).toEqual([first, second]);
    expect(result.current.data.next.friends).toBeNull();
  });

  it('A와 B 초대 미리보기 응답이 역전되어도 최신 B만 표시한다', async () => {
    const api = repository();
    const finish = new Map<
      string,
      (value: SocialResponse<{ nickname: string; expiresAt: number }>) => void
    >();
    api.previewInvite.mockImplementation(
      ({ token }) =>
        new Promise((resolve) => {
          finish.set(token, resolve);
        }),
    );
    const { result } = renderHook(() => useSocialRelations(true));
    await waitFor(() => expect(result.current.phase).toBe('ready'));

    let first: Promise<void> = Promise.resolve();
    let second: Promise<void> = Promise.resolve();
    act(() => {
      first = result.current.previewInvite(TOKEN);
      second = result.current.previewInvite('b'.repeat(64));
    });
    await act(async () => {
      finish.get('b'.repeat(64))?.(response({ nickname: 'B', expiresAt: RESPONSE_TIME }));
      await second;
    });
    await act(async () => {
      finish.get(TOKEN)?.(response({ nickname: 'A', expiresAt: RESPONSE_TIME }));
      await first;
    });
    expect(result.current.previewToken).toBe('b'.repeat(64));
    expect(result.current.preview?.nickname).toBe('B');
  });

  it('초대를 닫으면 늦은 미리보기 오류도 현재 화면에 남기지 않는다', async () => {
    const api = repository();
    let reject: (error: Error) => void = () => {
      throw new Error('미설정');
    };
    api.previewInvite.mockImplementation(
      () =>
        new Promise((_, fail) => {
          reject = fail;
        }),
    );
    const { result } = renderHook(() => useSocialRelations(true));
    await waitFor(() => expect(result.current.phase).toBe('ready'));
    let pending: Promise<void> = Promise.resolve();
    act(() => {
      pending = result.current.previewInvite(TOKEN);
      void result.current.previewInvite(null);
    });
    await act(async () => {
      reject(new Error('old preview'));
      await pending;
    });
    expect(result.current.previewToken).toBeNull();
    expect(result.current.previewPhase).toBe('idle');
    expect(result.current.error).toBeNull();
  });
});
