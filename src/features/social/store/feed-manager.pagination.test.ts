import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { PostView, SocialResponse } from '@/domain/social/social';

import type { PublicSocialRepository, SocialRepository } from '@/repositories/social-repository';

import type { FeedView } from '@/features/social/lib/feed-validation';
import { browserFeedClock } from '@/features/social/lib/validate-page';
import type { SocialSessionClient } from '@/features/social/session-lifecycle';
import { createSocialFeedManager } from '@/features/social/store/feed-manager';

const author = { id: 'a'.repeat(32), nickname: '나' };
const first: PostView = {
  id: 'b'.repeat(32),
  author,
  text: '첫 페이지',
  happenedOn: '2026-09-30',
  createdAt: 2,
  reactionCount: 0,
  myReaction: false,
};
const second: PostView = { ...first, id: 'c'.repeat(32), text: '두 번째 페이지', createdAt: 1 };
const answer = <T>(data: T): SocialResponse<T> => ({ data, serverTime: 1 });
async function settle() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture() {
  let client: SocialSessionClient | null = null;
  let active = true;
  let page2 = second;
  let allowSecond = true;
  const read = vi
    .fn<SocialRepository['feed']>()
    .mockImplementation(async (page) =>
      answer(
        page?.cursor === 'page-2'
          ? { items: [page2], nextCursor: 'page-3' }
          : { items: [first], nextCursor: 'page-2' },
      ),
    );
  const validate = vi
    .fn<SocialRepository['validatePosts']>()
    .mockImplementation(async ({ ids }) =>
      answer({ allowedIds: ids.filter((id) => allowSecond || id !== second.id) }),
    );
  const friends = vi.fn(read);
  const mine = vi.fn(read);
  const discover = vi.fn(read);
  const repository = {
    me: async () => answer({ profile: { ...author, version: 1 }, mode: 'enabled' }),
    feed: friends,
    myPosts: mine,
    validatePosts: validate,
  } as unknown as SocialRepository;
  const publicRepository = {
    feed: discover,
    validatePosts: validate,
  } as unknown as PublicSocialRepository;
  const manager = createSocialFeedManager(
    {
      repository: () => repository,
      publicRepository: () => publicRepository,
      clock: browserFeedClock,
      capture: () => () => active,
      activate: async () => ({ token: 'scope', epoch: 1 }),
      deactivate: () => {
        active = false;
      },
      attach: (next) => {
        client = next;
        return () => {
          client = null;
        };
      },
      invalidateSession: (reason) => client?.invalidate(reason),
      online: () => true,
      visible: () => true,
    },
    () => {},
  );
  return {
    manager,
    friends,
    mine,
    discover,
    validate,
    changeReaction: () => {
      page2 = { ...second, reactionCount: 1, myReaction: true };
    },
    denySecond: () => {
      allowSecond = false;
    },
    endActor: () => {
      active = false;
      manager.invalidate('account');
    },
  };
}
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('mutation은 현재 feed page를 canonical로 갱신한다', () => {
  it.each(['friends', 'public', 'mine'] satisfies FeedView[])(
    '%s page2의 반응 count/pressed/ACL과 cursor stack을 유지한다',
    async (view) => {
      const f = fixture();
      await f.manager.open('category-filter');
      await settle();
      await f.manager.setView(view);
      await f.manager.next();
      const endpoint = view === 'friends' ? f.friends : view === 'public' ? f.discover : f.mine;
      f.changeReaction();
      await f.manager.refreshCurrent();
      expect(endpoint).toHaveBeenLastCalledWith({
        cursor: 'page-2',
        categoryId: 'category-filter',
      });
      expect(f.manager.getSnapshot().view).toBe(view);
      expect(f.manager.getSnapshot().pageIndex).toBe(1);
      expect(f.manager.getSnapshot().cursorStack).toEqual([null, 'page-2']);
      expect(f.manager.visibleItems()).toEqual([{ ...second, reactionCount: 1, myReaction: true }]);
      expect(f.validate).toHaveBeenLastCalledWith({ ids: [second.id] });
      f.denySecond();
      await f.manager.refreshCurrent();
      expect(f.manager.visibleItems()).toEqual([]);
      expect(f.manager.getSnapshot().pageIndex).toBe(1);
      expect(f.manager.getSnapshot().nextCursor).toBe('page-3');
      await f.manager.refresh();
      expect(endpoint).toHaveBeenLastCalledWith({ categoryId: 'category-filter' });
      expect(f.manager.getSnapshot().pageIndex).toBe(0);
      expect(f.manager.getSnapshot().cursorStack).toEqual([null]);
      expect(f.manager.visibleItems()).toEqual([first]);
      f.manager.close();
    },
  );

  it.each(['previous', 'actor'] as const)(
    'held page2 refresh 결과는 %s 변경 뒤 적용되지 않는다',
    async (boundary) => {
      const f = fixture();
      await f.manager.open();
      await settle();
      await f.manager.next();
      const held = deferred<SocialResponse<{ items: PostView[]; nextCursor: string | null }>>();
      f.friends.mockReturnValueOnce(held.promise);
      const pending = f.manager.refreshCurrent();
      await settle();
      expect(f.manager.visibleItems()).toEqual([]);
      if (boundary === 'previous') await f.manager.previous();
      else f.endActor();
      held.resolve(answer({ items: [{ ...second, reactionCount: 99 }], nextCursor: null }));
      await pending;
      expect(f.manager.getSnapshot().pageIndex).toBe(0);
      expect(f.manager.getSnapshot().cursorStack).toEqual([null]);
      expect(f.manager.visibleItems()).toEqual(boundary === 'previous' ? [first] : []);
      expect(f.manager.getSnapshot().items.some((item) => item.reactionCount === 99)).toBe(false);
      f.manager.close();
    },
  );
});
