import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@/domain/category/category';
import type { SocialCategoryView, SocialResponse } from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

import { createCategoryPublicationManager } from '@/features/category/store/category-publication-manager';
import { createPublicationRecovery } from '@/features/category/store/category-publication-recovery';
import { makeCategory } from '@/test/fixtures/category';

const canonical: SocialCategoryView = {
  id: 'remote',
  name: '서버 R',
  color: '#EF9A9A',
  visibility: 'friends',
  version: 3,
  updatedAt: 1,
};
const answer = <T>(data: T): SocialResponse<T> => ({ data, serverTime: 1 });
function fixture() {
  const recovery = createPublicationRecovery();
  let locals: readonly Category[] = [makeCategory({ name: '개인 L' })];
  let identity = 1;
  const me = vi
    .fn<SocialRepository['me']>()
    .mockResolvedValue(
      answer({ profile: { id: 'actor', nickname: '나', version: 1 }, mode: 'enabled' }),
    );
  const categories = vi
    .fn<SocialRepository['categories']>()
    .mockResolvedValue(answer({ items: [canonical], nextCursor: null }));
  const category = vi.fn<SocialRepository['category']>().mockResolvedValue(answer(canonical));
  const revokeCategory = vi
    .fn<SocialRepository['revokeCategory']>()
    .mockResolvedValue(answer({ ...canonical, visibility: 'private', revoked: true, version: 4 }));
  const saveCategory = vi.fn<SocialRepository['saveCategory']>();
  let number = 0;
  const persist = vi.fn(
    async (remote: SocialCategoryView | null, original?: Category, allowed?: () => boolean) => {
      if (original === undefined || !allowed?.()) return false;
      locals = locals.map((local) =>
        local.id !== original.id
          ? local
          : {
              ...local,
              visibility: remote?.visibility ?? 'private',
              socialCategoryId: remote?.id,
              socialCategoryVersion: remote?.version,
            },
      );
      return true;
    },
  );
  const deps = {
    recovery,
    persist,
    repository: () =>
      ({ me, categories, category, revokeCategory, saveCategory }) as unknown as SocialRepository,
    capture: () => {
      const captured = identity;
      return () => captured === identity;
    },
    online: () => true,
    getLocal: (id: string) => locals.find((local) => local.id === id),
    listLocal: () => locals,
    key: () => `key-${++number}`,
  };
  const create = () => createCategoryPublicationManager(deps);
  return {
    recovery,
    deps,
    create,
    me,
    categories,
    category,
    revokeCategory,
    saveCategory,
    persist,
    locals: () => locals,
    setLocals: (next: readonly Category[]) => {
      locals = next;
    },
    invalidateIdentity: () => {
      identity += 1;
    },
  };
}
afterEach(() => vi.useRealTimers());

describe('공유 카테고리의 명시적 소유자 관리', () => {
  it('페이지는 owner 포트만 명시 조회하며 아무 서버 상태도 바꾸지 않는다', async () => {
    const f = fixture();
    const manager = f.create();
    expect(f.me).not.toHaveBeenCalled();
    f.categories.mockResolvedValueOnce(answer({ items: [], nextCursor: 'next' }));
    expect(await manager.refresh()).toBe(true);
    expect(manager.getSnapshot()).toMatchObject({ items: [], nextCursor: 'next' });
    expect(await manager.next()).toBe(true);
    expect(f.categories).toHaveBeenLastCalledWith({ limit: 50, cursor: 'next' });
    expect(f.category).not.toHaveBeenCalled();
    expect(f.saveCategory).not.toHaveBeenCalled();
    expect(f.revokeCategory).not.toHaveBeenCalled();
  });

  it('L/R 이름을 유지하며 확인한 R 범위의 표식 세 개만 연결한다', async () => {
    const f = fixture();
    const manager = f.create();
    const before = f.locals()[0];
    expect(await manager.prepareAttach(canonical.id, before.id)).toBe(true);
    const prepared = manager.getSnapshot().prepared!;
    expect(prepared.canonical.name).toBe('서버 R');
    expect(prepared.origin?.name).toBe('개인 L');
    expect(await manager.confirmAttach(prepared)).toBe(true);
    expect(f.locals()[0]).toEqual({
      ...before,
      visibility: 'friends',
      socialCategoryId: 'remote',
      socialCategoryVersion: 3,
    });
    expect(f.saveCategory).not.toHaveBeenCalled();
    expect(f.revokeCategory).not.toHaveBeenCalled();
    expect(f.category).not.toHaveBeenCalled();
  });

  it('확인 중 원격 확대/버전 변경은 새 미리보기와 새 확인을 요구한다', async () => {
    const f = fixture();
    const manager = f.create();
    await manager.prepareAttach(canonical.id, f.locals()[0].id);
    const original = manager.getSnapshot().prepared!;
    const changed = { ...canonical, visibility: 'public' as const, version: 4 };
    f.categories.mockResolvedValue(answer({ items: [changed], nextCursor: null }));
    expect(await manager.confirmAttach(original)).toBe(false);
    expect(f.persist).not.toHaveBeenCalled();
    expect(manager.getSnapshot().prepared?.canonical).toEqual(changed);
    expect(await manager.confirmAttach(original)).toBe(false);
    expect(await manager.confirmAttach(manager.getSnapshot().prepared!)).toBe(true);
  });

  it.each(['changed', 'deleted', 'duplicate', 'bound', 'pending', 'revoked'] as const)(
    '%s 연결은 거절하며 다른 기기 projection을 철회하지 않는다',
    async (kind) => {
      const f = fixture();
      const manager = f.create();
      const local = f.locals()[0];
      if (kind === 'revoked')
        f.categories.mockResolvedValue(
          answer({ items: [{ ...canonical, revoked: true }], nextCursor: null }),
        );
      await manager.prepareAttach(canonical.id, local.id);
      const prepared = manager.getSnapshot().prepared;
      if (kind === 'changed') f.setLocals([{ ...local, name: '동기화 이름' }]);
      if (kind === 'deleted') f.setLocals([]);
      if (kind === 'duplicate')
        f.setLocals([local, makeCategory({ seq: 2, socialCategoryId: canonical.id })]);
      if (kind === 'bound') f.setLocals([{ ...local, socialCategoryId: 'other' }]);
      if (kind === 'pending')
        f.recovery.reserve(
          `local:${local.id}`,
          {
            kind: 'save',
            original: local,
            input: {
              name: local.name,
              color: local.color,
              visibility: 'public',
              expectedVersion: 0,
            },
          },
          () => 'unknown',
        );
      if (prepared !== null) expect(await manager.confirmAttach(prepared)).toBe(false);
      expect(f.persist).not.toHaveBeenCalled();
      expect(f.revokeCategory).not.toHaveBeenCalled();
    },
  );

  it('owner 페이지를 다 확인하지 못하면 존재하지 않다고 판정하거나 표식을 지우지 않는다', async () => {
    const f = fixture();
    const manager = f.create();
    let page = 0;
    f.categories.mockImplementation(async () =>
      answer({ items: [], nextCursor: `more-${++page}` }),
    );
    expect(await manager.prepareAttach('not-yet-found', f.locals()[0].id)).toBe(false);
    expect(f.categories).toHaveBeenCalledTimes(20);
    expect(f.persist).not.toHaveBeenCalled();
    expect(manager.getSnapshot().error).toBe('temporary');
  });

  it('optional postCount가 없더라도 owner 포트의 canonical은 소유권 근거다', async () => {
    const f = fixture();
    const manager = f.create();
    expect(canonical).not.toHaveProperty('postCount');
    expect(await manager.prepareAttach(canonical.id, f.locals()[0].id)).toBe(true);
    expect(await manager.confirmAttach(manager.getSnapshot().prepared!)).toBe(true);
  });

  it('대기 중 actor 변경은 준비한 연결을 로컬에 쓰지 않는다', async () => {
    const f = fixture();
    const manager = f.create();
    await manager.prepareAttach(canonical.id, f.locals()[0].id);
    const prepared = manager.getSnapshot().prepared!;
    f.invalidateIdentity();
    manager.invalidate('account');
    expect(await manager.confirmAttach(prepared)).toBe(false);
    expect(f.persist).not.toHaveBeenCalled();
  });

  it('철회 unknown은 재열기 후 원래 key/version/CAS로만 재확인한다', async () => {
    const f = fixture();
    const linked = {
      ...f.locals()[0],
      visibility: 'friends' as const,
      socialCategoryId: canonical.id,
      socialCategoryVersion: 3,
    };
    f.setLocals([linked]);
    const manager = f.create();
    await manager.prepareRevoke(canonical.id);
    f.revokeCategory.mockRejectedValueOnce(new Error('응답 소실'));
    expect(await manager.confirmRevoke(manager.getSnapshot().prepared!)).toBe(false);
    expect(manager.hasPendingRemote(canonical.id)).toBe(true);
    manager.dispose();
    f.setLocals([{ ...linked, name: '새 동기화 이름' }]);
    const reopened = f.create();
    await reopened.prepareRevoke(canonical.id);
    expect(await reopened.retryPending()).toBe(false);
    expect(f.revokeCategory.mock.calls[1]).toEqual(f.revokeCategory.mock.calls[0]);
    expect(f.locals()[0].socialCategoryId).toBe(canonical.id);
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.recovery.list()).toHaveLength(0);
  });

  it('409는 최신 canonical을 표시하고 새 확인 클릭에 새 key를 쓴다', async () => {
    const f = fixture();
    const manager = f.create();
    await manager.prepareRevoke(canonical.id);
    f.revokeCategory.mockRejectedValueOnce({ code: 'conflict' });
    f.categories.mockResolvedValue(
      answer({ items: [{ ...canonical, version: 8 }], nextCursor: null }),
    );
    expect(await manager.confirmRevoke(manager.getSnapshot().prepared!)).toBe(false);
    expect(f.revokeCategory).toHaveBeenCalledTimes(1);
    expect(manager.getSnapshot().prepared?.canonical.version).toBe(8);
    expect(await manager.confirmRevoke(manager.getSnapshot().prepared!)).toBe(true);
    expect(f.revokeCategory.mock.calls[1]).toEqual([
      { id: canonical.id, expectedVersion: 8 },
      { key: 'key-2' },
    ]);
  });

  it('off의 명시 owner 철회는 가능하며 나머지 연결과 projection은 유지한다', async () => {
    const f = fixture();
    f.me.mockResolvedValue(
      answer({ profile: { id: 'actor', nickname: '나', version: 1 }, mode: 'off' }),
    );
    const linked = {
      ...f.locals()[0],
      visibility: 'friends' as const,
      socialCategoryId: canonical.id,
      socialCategoryVersion: 3,
    };
    const other = makeCategory({ seq: 2, socialCategoryId: 'other-device' });
    f.setLocals([linked, other]);
    const manager = f.create();
    await manager.prepareRevoke(canonical.id);
    expect(await manager.confirmRevoke(manager.getSnapshot().prepared!)).toBe(true);
    expect(f.locals()[0].socialCategoryId).toBeUndefined();
    expect(f.locals()[1]).toEqual(other);
    expect(f.saveCategory).not.toHaveBeenCalled();
  });

  it('unknown 철회의 expired key는 tombstone 재열기에도 보관하고 재전송을 막는다', async () => {
    const f = fixture();
    const manager = f.create();
    await manager.prepareRevoke(canonical.id);
    f.revokeCategory.mockRejectedValueOnce(new Error('lost response'));
    await manager.confirmRevoke(manager.getSnapshot().prepared!);
    f.revokeCategory.mockRejectedValueOnce({ code: 'request-expired' });
    await manager.retryPending();
    manager.dispose();
    f.categories.mockResolvedValue(
      answer({ items: [{ ...canonical, revoked: true }], nextCursor: null }),
    );
    const reopened = f.create();
    expect(await reopened.prepareRevoke(canonical.id)).toBe(true);
    expect(reopened.getSnapshot()).toMatchObject({ uncertain: true, error: 'request-expired' });
    expect(await reopened.retryPending()).toBe(false);
    expect(f.revokeCategory).toHaveBeenCalledTimes(2);
    expect(f.recovery.list()).toHaveLength(1);
  });
});
