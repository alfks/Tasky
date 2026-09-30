import { describe, expect, it, vi } from 'vitest';

import { createLazyPublicSocialRepository } from '@/repositories/lazy-public-social-repository';
import type { PublicSocialRepository } from '@/repositories/social-repository';

const EMPTY = { data: { items: [], nextCursor: null }, serverTime: 1 };

describe('공개 read port 지연 경계', () => {
  it('만들기만 하면 모듈/개인 인증을 시작하지 않고 동시 읽기는 단일 구현을 공유한다', async () => {
    const feed = vi.fn(async () => EMPTY);
    const load = vi.fn(async () => ({ feed }) as unknown as PublicSocialRepository);
    const repo = createLazyPublicSocialRepository(load);
    expect(load).not.toHaveBeenCalled();
    await Promise.all([repo.feed(), repo.feed()]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(feed).toHaveBeenCalledTimes(2);
    expect(Object.keys(repo).sort()).toEqual(['categories', 'feed', 'post', 'validatePosts']);
  });
  it('청크 실패는 자동 재시도하지 않고 다음 명시적 호출에서 다시 읽는다', async () => {
    const load = vi
      .fn()
      .mockRejectedValueOnce(new Error('청크 실패'))
      .mockResolvedValueOnce({ feed: async () => EMPTY });
    const repo = createLazyPublicSocialRepository(load);
    await expect(repo.feed()).rejects.toThrow('청크 실패');
    expect(load).toHaveBeenCalledTimes(1);
    await expect(repo.feed()).resolves.toEqual(EMPTY);
    expect(load).toHaveBeenCalledTimes(2);
  });
});
