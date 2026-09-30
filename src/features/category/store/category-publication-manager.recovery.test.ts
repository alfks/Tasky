import { describe, expect, it, vi } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { SocialCategoryView, SocialResponse } from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

import { createCategoryPublicationManager } from '@/features/category/store/category-publication-manager';
import { createPublicationRecovery } from '@/features/category/store/category-publication-recovery';
import { makeCategory } from '@/test/fixtures/category';

const canonical: SocialCategoryView = {
  id: 'remote',
  name: '공유',
  color: '#EF9A9A',
  visibility: 'public',
  version: 3,
  updatedAt: 1,
};
const answer = <T>(data: T): SocialResponse<T> => ({ data, serverTime: 1 });
function fixture() {
  const recovery = createPublicationRecovery();
  let remote = canonical;
  let local: Category = makeCategory({
    visibility: 'public',
    socialCategoryId: canonical.id,
    socialCategoryVersion: 3,
  });
  let identity = 0;
  let actor = 'actor';
  let keys = 0;
  const revoke = vi
    .fn<SocialRepository['revokeCategory']>()
    .mockImplementationOnce(async () => {
      remote = { ...canonical, visibility: 'private', version: 4, revoked: true };
      throw new Error('서버 commit 뒤 reply loss');
    })
    .mockImplementation(async () => answer(remote));
  const persist = vi.fn(
    async (_remote: SocialCategoryView | null, original?: Category, allowed?: () => boolean) => {
      if (
        !allowed?.() ||
        original === undefined ||
        original.socialCategoryId !== local.socialCategoryId
      )
        return false;
      const { socialCategoryId: _id, socialCategoryVersion: _version, ...rest } = local;
      local = { ...rest, visibility: 'private' };
      return true;
    },
  );
  const create = () =>
    createCategoryPublicationManager({
      recovery,
      persist,
      online: () => true,
      getLocal: () => local,
      listLocal: () => [local],
      key: () => `key-${++keys}`,
      capture: () => {
        const captured = identity;
        return () => captured === identity;
      },
      repository: () =>
        ({
          me: async () =>
            answer({ profile: { id: actor, nickname: '나', version: 1 }, mode: 'enabled' }),
          categories: async () => answer({ items: [remote], nextCursor: null }),
          revokeCategory: revoke,
        }) as unknown as SocialRepository,
    });
  return {
    create,
    recovery,
    revoke,
    persist,
    local: () => local,
    switchActor: () => {
      identity++;
      actor = 'other';
    },
  };
}

describe('철회된 owner projection의 원래 receipt 확인', () => {
  it('commit 뒤 응답 소실을 재열린 tombstone에서 같은 key/version으로 완료 확인한다', async () => {
    const f = fixture();
    const first = f.create();
    expect(await first.prepareRevoke(canonical.id)).toBe(true);
    expect(await first.confirmRevoke(first.getSnapshot().prepared!)).toBe(false);
    const intent = f.recovery.list()[0].intent;
    first.dispose();
    const reopened = f.create();
    expect(await reopened.refresh()).toBe(true);
    expect(reopened.getSnapshot().items[0].revoked).toBe(true);
    expect(reopened.hasPendingRemote(canonical.id)).toBe(true);
    expect(await reopened.prepareRevoke(canonical.id)).toBe(true);
    expect(reopened.getSnapshot().uncertain).toBe(true);
    expect(await reopened.retryPending()).toBe(true);
    expect(f.revoke.mock.calls[1]).toEqual(f.revoke.mock.calls[0]);
    expect(f.revoke.mock.calls[1][0].expectedVersion).toBe(3);
    expect(intent.kind === 'revoke' ? intent.originals?.[0].visibility : null).toBe('public');
    expect(f.local().visibility).toBe('private');
    expect(f.local().socialCategoryId).toBeUndefined();
    expect(f.local().socialCategoryVersion).toBeUndefined();
    expect(f.recovery.list()).toHaveLength(0);
    expect(await reopened.prepareRevoke(canonical.id)).toBe(false);
    expect(f.revoke).toHaveBeenCalledTimes(2);
  });

  it('hard account 교체 뒤 옛 tombstone intent를 실행하거나 개인 연결을 지우지 않는다', async () => {
    const f = fixture();
    const first = f.create();
    await first.prepareRevoke(canonical.id);
    await first.confirmRevoke(first.getSnapshot().prepared!);
    f.switchActor();
    first.invalidate('account');
    expect(await first.retryPending()).toBe(false);
    expect(f.revoke).toHaveBeenCalledTimes(1);
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.local().socialCategoryId).toBe(canonical.id);
    expect(f.recovery.list()).toHaveLength(0);
  });
});
