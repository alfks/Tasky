import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PostView, ProfileView, SocialResponse } from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

import type { SocialSessionClient, SocialSessionScope } from '@/features/social/session-lifecycle';
import { createSocialFeedManager } from '@/features/social/store/feed-manager';
import { socialFeedClock } from '@/features/social/store/social-store';

const profile: ProfileView = { id: 'a'.repeat(32), nickname: '하나', version: 1 };
const post: PostView = {
  id: 'b'.repeat(32),
  author: { id: profile.id, nickname: profile.nickname },
  text: '공유',
  happenedOn: '2026-09-28',
  createdAt: 1,
  reactionCount: 0,
  myReaction: false,
};
const answer = <T>(data: T): SocialResponse<T> => ({ data, serverTime: Date.now() });
const settle = async () => {
  for (let i = 0; i < 12; i += 1) await Promise.resolve();
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

function fixture(activation?: () => Promise<SocialSessionScope | null>) {
  let client: SocialSessionClient | null = null;
  let online = true;
  let visible = true;
  let gate = true;
  const me = vi.fn(async (): ReturnType<SocialRepository['me']> =>
    answer({ profile, mode: 'enabled' }),
  );
  const feed = vi.fn(async (): ReturnType<SocialRepository['feed']> =>
    answer({ items: [post], nextCursor: null }),
  );
  const validatePosts = vi.fn(async (): ReturnType<SocialRepository['validatePosts']> =>
    answer({ allowedIds: [post.id] }),
  );
  const repo = { me, feed, validatePosts } as unknown as SocialRepository;
  const invalidateSession = vi.fn((reason: string) => client?.invalidate(reason as never));
  const manager = createSocialFeedManager(
    {
      repository: () => repo,
      clock: socialFeedClock,
      capture: () => () => gate,
      activate: async () => {
        gate = true;
        const scope = activation === undefined ? { token: 'opaque', epoch: 1 } : await activation();
        if (scope !== null) client?.resume?.(scope);
        return scope;
      },
      deactivate: () => {
        gate = false;
      },
      attach: (next) => {
        client = next;
        return () => {
          client = null;
        };
      },
      invalidateSession,
      online: () => online,
      visible: () => visible,
    },
    () => {},
  );
  return {
    manager,
    me,
    feed,
    validatePosts,
    invalidateSession,
    setOnline: (value: boolean) => {
      online = value;
    },
    setVisible: (value: boolean) => {
      visible = value;
    },
    setGate: (value: boolean) => {
      gate = value;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-09-28T00:00:00Z'));
});
afterEach(() => vi.useRealTimers());

describe('social feed lease and generation', () => {
  it('starts blocked; reveals only after whole-page validation; stops on close', async () => {
    const f = fixture();
    const pending = deferred<SocialResponse<{ allowedIds: readonly string[] }>>();
    f.validatePosts.mockReturnValueOnce(pending.promise);
    expect(f.manager.getSnapshot().phase).toBe('blocked');
    expect(f.me).not.toHaveBeenCalled();
    await f.manager.open();
    await settle();
    expect(f.manager.getSnapshot().phase).toBe('loading');
    expect(f.manager.visibleItems()).toEqual([]);
    pending.resolve(answer({ allowedIds: [post.id] }));
    await settle();
    expect(f.manager.visibleItems()).toEqual([post]);
    f.manager.close();
    expect(f.manager.getSnapshot().items).toEqual([]);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(f.validatePosts).toHaveBeenCalledTimes(1);
  });

  it('fails closed at the five-second validation deadline', async () => {
    const f = fixture();
    f.validatePosts.mockReturnValueOnce(new Promise(() => {}));
    await f.manager.open();
    await settle();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.manager.getSnapshot().phase).toBe('error');
    expect(f.manager.visibleItems()).toEqual([]);
  });

  it('첫 페이지 검증이 4.9초 늦어도 요청 시작+35초에 닫고 +30초에 재검증한다', async () => {
    const f = fixture();
    const first = deferred<SocialResponse<{ allowedIds: readonly string[] }>>();
    f.validatePosts.mockReturnValueOnce(first.promise);
    await f.manager.open();
    await settle();
    const startedAt = socialFeedClock.now();
    await vi.advanceTimersByTimeAsync(4_900);
    first.resolve(answer({ allowedIds: [post.id] }));
    await settle();
    expect(f.manager.getSnapshot().leaseUntil).toBe(startedAt + 35_000);
    expect(f.manager.visibleItems()).toEqual([post]);

    f.validatePosts.mockReturnValueOnce(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(25_100);
    expect(f.validatePosts).toHaveBeenCalledTimes(2);
    expect(f.manager.visibleItems()).toEqual([]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.manager.getSnapshot().phase).toBe('error');
    expect(f.manager.visibleItems()).toEqual([]);
  });

  it('주기 검증이 4.9초 늦어도 이전 요청 시작+35초를 넘기지 않는다', async () => {
    const f = fixture();
    await f.manager.open();
    await settle();
    const firstStartedAt = socialFeedClock.now();
    const second = deferred<SocialResponse<{ allowedIds: readonly string[] }>>();
    f.validatePosts.mockReturnValueOnce(second.promise);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.manager.visibleItems()).toEqual([]);
    await vi.advanceTimersByTimeAsync(4_900);
    second.resolve(answer({ allowedIds: [post.id] }));
    await settle();
    expect(f.manager.getSnapshot().leaseUntil).toBe(firstStartedAt + 65_000);
    expect(f.manager.visibleItems()).toEqual([post]);

    f.validatePosts.mockReturnValueOnce(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(25_100);
    expect(f.validatePosts).toHaveBeenCalledTimes(3);
    expect(f.manager.visibleItems()).toEqual([]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(f.manager.getSnapshot().phase).toBe('error');
    expect(f.manager.visibleItems()).toEqual([]);
  });

  it('hides during periodic validation and discards a late success', async () => {
    const f = fixture();
    await f.manager.open();
    await settle();
    expect(f.manager.visibleItems()).toEqual([post]);
    const pending = deferred<SocialResponse<{ allowedIds: readonly string[] }>>();
    f.validatePosts.mockReturnValueOnce(pending.promise);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.manager.visibleItems()).toEqual([]);
    f.manager.invalidate('revoked');
    pending.resolve(answer({ allowedIds: [post.id] }));
    await settle();
    expect(f.manager.getSnapshot().phase).toBe('blocked');
    expect(f.manager.getSnapshot().items).toEqual([]);
  });

  it('시스템 시각이 역행해도 실제 store 시계의 poll과 hard lease가 늘어나지 않는다', async () => {
    const f = fixture();
    await f.manager.open();
    await settle();
    const startedAt = socialFeedClock.now();
    expect(f.manager.getSnapshot().leaseUntil).toBe(startedAt + 35_000);
    vi.setSystemTime(Date.now() - 60_000);
    expect(socialFeedClock.now()).toBe(startedAt);

    f.validatePosts.mockReturnValueOnce(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.validatePosts).toHaveBeenCalledTimes(2);
    expect(f.manager.visibleItems()).toEqual([]);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(socialFeedClock.now()).toBe(startedAt + 35_000);
    expect(f.manager.getSnapshot().phase).toBe('error');
    expect(f.manager.visibleItems()).toEqual([]);
  });

  it('hides on offline or hidden state and never renders after lease expiry', async () => {
    const f = fixture();
    await f.manager.open();
    await settle();
    f.setOnline(false);
    expect(f.manager.visibleItems()).toEqual([]);
    f.setOnline(true);
    f.setVisible(false);
    expect(f.manager.visibleItems()).toEqual([]);
    f.setVisible(true);
    f.validatePosts.mockReturnValueOnce(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(35_000);
    expect(f.manager.visibleItems()).toEqual([]);
  });

  it('keeps only the current page and cursor stack', async () => {
    const f = fixture();
    const second = { ...post, id: 'c'.repeat(32) };
    f.feed
      .mockResolvedValueOnce(answer({ items: [post], nextCursor: 'next' }))
      .mockResolvedValueOnce(answer({ items: [second], nextCursor: null }));
    f.validatePosts
      .mockResolvedValueOnce(answer({ allowedIds: [post.id] }))
      .mockResolvedValueOnce(answer({ allowedIds: [second.id] }));
    await f.manager.open();
    await settle();
    await f.manager.next();
    expect(f.manager.getSnapshot().items).toEqual([second]);
    expect(f.manager.getSnapshot().cursorStack).toEqual([null, 'next']);
    expect(f.manager.getSnapshot().pageIndex).toBe(1);
  });

  it('명령 후 현재 두 번째 페이지를 재조회하고 이전 경로를 유지한다', async () => {
    const f = fixture();
    const second = { ...post, id: 'c'.repeat(32) };
    const reacted = { ...second, reactionCount: 1, myReaction: true };
    f.feed
      .mockResolvedValueOnce(answer({ items: [post], nextCursor: 'next' }))
      .mockResolvedValueOnce(answer({ items: [second], nextCursor: null }))
      .mockResolvedValueOnce(answer({ items: [reacted], nextCursor: null }))
      .mockResolvedValueOnce(answer({ items: [post], nextCursor: 'next' }));
    f.validatePosts.mockResolvedValue(answer({ allowedIds: [post.id, second.id] }));
    await f.manager.open();
    await settle();
    await f.manager.next();
    await f.manager.refreshCurrent();

    expect(f.feed).toHaveBeenNthCalledWith(3, { cursor: 'next' });
    expect(f.manager.getSnapshot().items).toEqual([reacted]);
    expect(f.manager.getSnapshot().cursorStack).toEqual([null, 'next']);
    expect(f.manager.getSnapshot().pageIndex).toBe(1);
    await f.manager.previous();
    expect(f.feed).toHaveBeenNthCalledWith(4, undefined);
    expect(f.manager.getSnapshot().items).toEqual([post]);
  });

  it('차단으로 현재 페이지가 비어도 자동으로 첫 페이지로 옮기지 않는다', async () => {
    const f = fixture();
    f.feed
      .mockResolvedValueOnce(answer({ items: [post], nextCursor: 'next' }))
      .mockResolvedValueOnce(answer({ items: [post], nextCursor: null }))
      .mockResolvedValueOnce(answer({ items: [], nextCursor: null }));
    await f.manager.open();
    await settle();
    await f.manager.next();
    await f.manager.refreshCurrent();

    expect(f.manager.getSnapshot()).toMatchObject({
      phase: 'ready',
      canShow: true,
      items: [],
      pageIndex: 1,
      cursorStack: [null, 'next'],
    });
  });

  it('현재 커서가 만료되면 본문을 가리고 명시적 첫 페이지 재시작을 기다린다', async () => {
    const f = fixture();
    f.feed
      .mockResolvedValueOnce(answer({ items: [post], nextCursor: 'next' }))
      .mockResolvedValueOnce(answer({ items: [post], nextCursor: null }))
      .mockRejectedValueOnce(Object.assign(new Error('cursor expired'), { code: 'validation' }))
      .mockResolvedValueOnce(answer({ items: [post], nextCursor: null }));
    await f.manager.open();
    await settle();
    await f.manager.next();
    await f.manager.refreshCurrent();

    expect(f.manager.getSnapshot()).toMatchObject({
      phase: 'error',
      canShow: false,
      items: [],
      pageIndex: 1,
      error: 'validation',
      cursorExpired: true,
    });
    await f.manager.refresh();
    expect(f.manager.getSnapshot()).toMatchObject({
      phase: 'ready',
      pageIndex: 0,
      cursorExpired: false,
    });
    f.validatePosts.mockRejectedValueOnce(
      Object.assign(new Error('bad validation'), { code: 'validation' }),
    );
    await f.manager.refreshCurrent();
    expect(f.manager.getSnapshot()).toMatchObject({
      phase: 'error',
      error: 'validation',
      cursorExpired: false,
    });
  });

  it('head 조회가 늦어도 검증 요청 시작 이후 35초 lease를 다시 시작하지 않는다', async () => {
    const f = fixture();
    await f.manager.open();
    await settle();
    const head =
      deferred<ReturnType<SocialRepository['feed']> extends Promise<infer T> ? T : never>();
    f.feed.mockReturnValueOnce(head.promise);
    await vi.advanceTimersByTimeAsync(30_000);
    expect(f.manager.visibleItems()).toEqual([]);
    await vi.advanceTimersByTimeAsync(36_000);
    head.resolve(answer({ items: [post], nextCursor: null }));
    await settle();
    expect(f.manager.getSnapshot().phase).toBe('error');
    expect(f.manager.visibleItems()).toEqual([]);
  });

  it('head 지연 뒤 다음 검증은 검증 요청 시작+30초에 시작한다', async () => {
    const f = fixture();
    await f.manager.open();
    await settle();
    const initialLeaseUntil = f.manager.getSnapshot().leaseUntil;
    const head =
      deferred<ReturnType<SocialRepository['feed']> extends Promise<infer T> ? T : never>();
    f.feed.mockReturnValueOnce(head.promise);
    await vi.advanceTimersByTimeAsync(30_000);
    await vi.advanceTimersByTimeAsync(10_000);
    head.resolve(answer({ items: [post], nextCursor: null }));
    await settle();
    expect(f.manager.getSnapshot().leaseUntil).toBe(initialLeaseUntil + 30_000);
    f.validatePosts.mockReturnValueOnce(new Promise(() => {}));
    await vi.advanceTimersByTimeAsync(20_000);
    expect(f.manager.getSnapshot().phase).toBe('loading');
    expect(f.manager.visibleItems()).toEqual([]);
  });

  it('닫힌 첫 활성화의 늦은 null이 새 활성화를 무효화하지 않는다', async () => {
    const first = deferred<SocialSessionScope | null>();
    const second = deferred<SocialSessionScope | null>();
    const activate = vi.fn().mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const f = fixture(() => activate());
    const oldOpen = f.manager.open();
    f.manager.close();
    const newOpen = f.manager.open();
    second.resolve({ token: 'new', epoch: 2 });
    await newOpen;
    await settle();
    expect(f.manager.getSnapshot().phase).toBe('ready');
    first.resolve(null);
    await oldOpen;
    expect(f.manager.getSnapshot().phase).toBe('ready');
  });
});
