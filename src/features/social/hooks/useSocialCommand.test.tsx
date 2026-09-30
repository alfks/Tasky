import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { useSocialCommand } from '@/features/social/hooks/useSocialCommand';

const { repository, invalidate } = vi.hoisted(() => ({
  repository: { me: vi.fn(async () => ({ data: { profile: { id: 'actor' } }, serverTime: 1 })) },
  invalidate: vi.fn(),
}));
vi.mock('@/repositories/container', () => ({ getSocialRepository: () => repository }));
vi.mock('@/features/social/session-lifecycle', () => ({
  captureSocialDispatch: () => () => true,
  invalidateSocialSession: invalidate,
  onSocialReady: () => () => undefined,
  onSocialInvalidation: () => () => undefined,
}));

describe('명령 결과와 재시도', () => {
  beforeEach(() => vi.clearAllMocks());
  it('409의 현재 호출 결과로 새 상태를 확인하고 다음 명시 클릭에 새 키를 쓴다', async () => {
    const { result } = renderHook(useSocialCommand);
    const keys: string[] = [];
    const refresh = vi.fn();
    await act(async () => {
      await result.current.run(
        'accept',
        'version1',
        async (_repo, options) => {
          keys.push(options.key);
          throw { code: 'conflict' };
        },
        refresh,
      );
    });
    expect(refresh).toHaveBeenCalledWith('conflict', false);
    await act(async () => {
      await result.current.run('accept', 'version2', async (_repo, options) => {
        keys.push(options.key);
        return { data: true, serverTime: 1 };
      });
    });
    expect(keys[1]).not.toBe(keys[0]);
  });
  it('응답을 잃은 요청은 같은 입력과 키로 재확인한다', async () => {
    const { result } = renderHook(useSocialCommand);
    const keys: string[] = [];
    const send = vi.fn(async (_repo, options: { key: string }) => {
      keys.push(options.key);
      if (keys.length === 1) throw { code: 'temporary' };
      return { data: true, serverTime: 1 };
    });
    await act(async () => {
      await result.current.run('share', 'original', send);
    });
    await act(async () => {
      await result.current.run('share', 'changed', send);
    });
    expect(send).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.run('share', 'original', send);
    });
    expect(keys[1]).toBe(keys[0]);
  });
});
