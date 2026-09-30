import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PostView, SocialResponse } from '@/domain/social/social';

import type { PublicSocialRepository, SocialRepository } from '@/repositories/social-repository';

import { createSocialFeedManager } from '@/features/social/store/feed-manager';
import { createPublicFeedManager } from '@/features/social/store/public-feed-manager';
import { socialFeedClock } from '@/features/social/store/social-store';

const post: PostView = {
  id: 'b'.repeat(32),
  author: { id: 'a'.repeat(32), nickname: '하나' },
  text: '직접 공유한 문장',
  happenedOn: '2026-09-28',
  createdAt: 1,
  reactionCount: 0,
  myReaction: false,
};
const answer = <T>(data: T): SocialResponse<T> => ({ data, serverTime: Date.now() });
const settle = async () => {
  for (let i = 0; i < 16; i += 1) await Promise.resolve();
};

function fixture() {
  let online = true;
  let visible = true;
  const feed = vi
    .fn<PublicSocialRepository['feed']>()
    .mockResolvedValue(answer({ items: [post], nextCursor: null }));
  const validatePosts = vi
    .fn<PublicSocialRepository['validatePosts']>()
    .mockResolvedValue(answer({ allowedIds: [post.id] }));
  const repository = { feed, validatePosts } as unknown as PublicSocialRepository;
  const manager = createPublicFeedManager(
    {
      repository: () => repository,
      clock: socialFeedClock,
      online: () => online,
      visible: () => visible,
    },
    () => {},
  );
  return {
    manager,
    feed,
    validatePosts,
    setOnline: (value: boolean) => {
      online = value;
    },
    setVisible: (value: boolean) => {
      visible = value;
    },
    repository,
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-28T00:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('익명 공개 읽기의 독립 경계', () => {
  it('개인 세션과 프로필 없이 전체 페이지를 검증한 다음 공개한다', async () => {
    const f = fixture();
    await f.manager.open('c'.repeat(32));
    expect(f.feed).toHaveBeenCalledWith({ categoryId: 'c'.repeat(32) });
    expect(f.validatePosts).toHaveBeenCalledWith({ ids: [post.id] });
    expect(f.manager.visibleItems()).toEqual([post]);
    expect(f.manager.getSnapshot()).not.toHaveProperty('profile');
    expect(f.manager.getSnapshot()).not.toHaveProperty('mode');
    f.manager.close();
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.feed).toHaveBeenCalledTimes(1);
  });

  it('빈 공개 페이지의 다음 cursor를 보존하고 자동 반복 조회하지 않는다', async () => {
    const f = fixture();
    f.feed.mockResolvedValueOnce(answer({ items: [], nextCursor: 'sparse-next' }));
    await f.manager.open();
    expect(f.manager.visibleItems()).toEqual([]);
    expect(f.manager.getSnapshot().nextCursor).toBe('sparse-next');
    expect(f.feed).toHaveBeenCalledTimes(1);
    await f.manager.next();
    expect(f.feed).toHaveBeenLastCalledWith({ cursor: 'sparse-next' });
    expect(f.manager.visibleItems()).toEqual([post]);
    f.manager.close();
  });

  it('오프라인과 숨김 상태를 렌더 순간 가리고 검증의 5초 마감 뒤 폐기한다', async () => {
    const f = fixture();
    await f.manager.open();
    f.setOnline(false);
    expect(f.manager.visibleItems()).toEqual([]);
    f.setOnline(true);
    f.setVisible(false);
    expect(f.manager.visibleItems()).toEqual([]);
    f.setVisible(true);
    f.validatePosts.mockReturnValueOnce(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.manager.visibleItems()).toEqual([]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.manager.getSnapshot().phase).toBe('error');
    expect(f.manager.visibleItems()).toEqual([]);
    f.manager.close();
  });

  it('인증 변경 알림이나 focus로 가린 뒤 이전 공개 응답이 새 ACL 결과를 되살리지 못한다', async () => {
    const f = fixture();
    let finish!: (
      response: SocialResponse<{ items: readonly PostView[]; nextCursor: null }>,
    ) => void;
    const pending = new Promise<SocialResponse<{ items: readonly PostView[]; nextCursor: null }>>(
      (resolve) => {
        finish = resolve;
      },
    );
    f.feed.mockReturnValueOnce(pending);
    const opening = f.manager.open();
    await settle();
    f.manager.invalidate();
    expect(f.manager.visibleItems()).toEqual([]);
    f.feed.mockResolvedValueOnce(answer({ items: [], nextCursor: null }));
    await f.manager.refresh();
    finish(answer({ items: [post], nextCursor: null }));
    await opening;
    expect(f.manager.visibleItems()).toEqual([]);
    expect(f.manager.getSnapshot().items).toEqual([]);
    f.manager.close();
  });

  it('공개 응답의 401은 내용을 지우고 쿠키 없는 재시도를 만들지 않는다', async () => {
    const f = fixture();
    f.feed.mockRejectedValueOnce(Object.assign(new Error('인증 만료'), { code: 'unauthorized' }));
    await f.manager.open();
    expect(f.manager.getSnapshot().error).toBe('unauthorized');
    expect(f.manager.visibleItems()).toEqual([]);
    expect(f.feed).toHaveBeenCalledTimes(1);
    expect(f.validatePosts).not.toHaveBeenCalled();
    f.manager.close();
  });
});

describe('인증된 공개 보기와 내 공유 관리', () => {
  function signedFixture() {
    const publicFixture = fixture();
    let gate = true;
    const me = vi
      .fn<SocialRepository['me']>()
      .mockResolvedValue(
        answer({ profile: { id: 'a'.repeat(32), nickname: '하나', version: 1 }, mode: 'enabled' }),
      );
    const feed = vi
      .fn<SocialRepository['feed']>()
      .mockResolvedValue(answer({ items: [], nextCursor: null }));
    const myPosts = vi
      .fn<SocialRepository['myPosts']>()
      .mockResolvedValue(answer({ items: [post], nextCursor: null }));
    const validatePosts = vi
      .fn<SocialRepository['validatePosts']>()
      .mockResolvedValue(answer({ allowedIds: [post.id] }));
    const invalidateSession = vi.fn(() => {
      gate = false;
      manager.invalidate('auth');
    });
    const manager = createSocialFeedManager(
      {
        repository: () => ({ me, feed, myPosts, validatePosts }) as unknown as SocialRepository,
        publicRepository: () => publicFixture.repository,
        clock: socialFeedClock,
        capture: () => () => gate,
        activate: async () => ({ token: 'signed', epoch: 1 }),
        deactivate: () => {
          gate = false;
        },
        attach: () => () => {},
        invalidateSession,
        online: () => true,
        visible: () => true,
      },
      () => {},
    );
    return { manager, me, feed, myPosts, validatePosts, invalidateSession, publicFixture };
  }

  it('전체 공개도 검증된 세션을 유지하고 공개 전용 validator로 비친구를 확인한다', async () => {
    const f = signedFixture();
    await f.manager.open();
    await settle();
    await f.manager.setView('public');
    expect(f.publicFixture.feed).toHaveBeenCalledTimes(1);
    expect(f.publicFixture.validatePosts).toHaveBeenCalledWith({ ids: [post.id] });
    expect(f.validatePosts).toHaveBeenCalledTimes(1);
    expect(f.manager.visibleItems()).toEqual([post]);
    f.publicFixture.feed.mockRejectedValueOnce(
      Object.assign(new Error('만료'), { code: 'unauthorized' }),
    );
    await f.manager.refresh();
    expect(f.invalidateSession).toHaveBeenCalledWith('auth');
    expect(f.manager.visibleItems()).toEqual([]);
    expect(f.publicFixture.feed).toHaveBeenCalledTimes(2);
    f.manager.close();
  });

  it('off 상태는 친구와 공개를 가리고 자신의 철회·삭제 목록만 보여 준다', async () => {
    const f = signedFixture();
    f.me.mockResolvedValue(
      answer({ profile: { id: 'a'.repeat(32), nickname: '하나', version: 1 }, mode: 'off' }),
    );
    await f.manager.open();
    await settle();
    expect(f.feed).not.toHaveBeenCalled();
    await f.manager.setView('public');
    expect(f.publicFixture.feed).not.toHaveBeenCalled();
    await f.manager.setView('mine');
    expect(f.myPosts).toHaveBeenCalledTimes(1);
    expect(f.manager.visibleItems()).toEqual([post]);
    f.manager.close();
  });
});
