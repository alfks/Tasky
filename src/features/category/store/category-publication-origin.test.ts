import { describe, expect, it, vi } from 'vitest';

import type { Category } from '@/domain/category/category';
import {
  clearCategoryVisibility,
  confirmCategoryVisibility,
} from '@/domain/category/visibility-cache';
import type { SocialCategoryView, SocialResponse } from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

import { createCategoryAudienceController } from '@/features/category/store/category-audience';
import { publicationOriginMatches } from '@/features/category/store/category-publication-contract';
import { createPublicationRecovery } from '@/features/category/store/category-publication-recovery';
import { makeCategory } from '@/test/fixtures/category';

const canonical: SocialCategoryView = {
  id: 'a'.repeat(32),
  name: '서버 이름',
  color: '#EF9A9A',
  visibility: 'public',
  version: 3,
  updatedAt: 1,
};
const answer = <T>(data: T): SocialResponse<T> => ({ data, serverTime: 1 });
const meta = { now: () => '2026-09-30T00:00:00.000Z', id: () => 'unused' };

function fixture(linked = false) {
  let local: Category = makeCategory({
    name: canonical.name,
    color: canonical.color,
    ...(linked
      ? { visibility: 'friends', socialCategoryId: canonical.id, socialCategoryVersion: 1 }
      : {}),
  });
  const recovery = createPublicationRecovery();
  const saveCategory = vi
    .fn<SocialRepository['saveCategory']>()
    .mockResolvedValue(answer(canonical));
  const revokeCategory = vi
    .fn<SocialRepository['revokeCategory']>()
    .mockResolvedValue(answer({ ...canonical, visibility: 'private', version: 4, revoked: true }));
  let writes = Promise.resolve();
  const persist = vi.fn(
    (remote: SocialCategoryView | null, original?: Category, allowed?: () => boolean) => {
      const pending = writes.then(() => {
        if (original === undefined || !allowed?.() || !publicationOriginMatches(local, original))
          return false;
        local =
          remote === null
            ? clearCategoryVisibility(local, meta)
            : confirmCategoryVisibility(local, remote, meta);
        return true;
      });
      writes = pending.then(() => undefined);
      return pending;
    },
  );
  let key = 0;
  const deps = {
    recovery,
    persist,
    online: () => true,
    capture: () => () => true,
    key: () => `key-${++key}`,
    repository: () =>
      ({
        me: async () =>
          answer({ profile: { id: 'actor', nickname: '나', version: 1 }, mode: 'enabled' }),
        categories: async () => answer({ items: [canonical], nextCursor: null }),
        saveCategory,
        revokeCategory,
      }) as unknown as SocialRepository,
  };
  return {
    create: () => createCategoryAudienceController({ ...local }, deps),
    read: () => local,
    replace: (next: Category) => {
      local = next;
    },
    recovery,
    saveCategory,
    revokeCategory,
    persist,
  };
}

describe('자기 확인 쓰기 뒤의 새 명령 CAS와 최초 불확실 명령 CAS', () => {
  it('오래된 무연결 undefined 표식을 private로 확인한 뒤 첫 공개 저장을 승인한다', async () => {
    const f = fixture();
    const controller = f.create();
    expect(f.read().visibility).toBeUndefined();
    await controller.refresh();
    expect(f.read().visibility).toBe('private');
    expect(await controller.change('public')).toBe(true);
    expect(f.read().socialCategoryId).toBe(canonical.id);
    expect(f.read().visibility).toBe('public');
    expect(f.saveCategory).toHaveBeenCalledTimes(1);
    expect(f.saveCategory.mock.calls[0][0]).not.toHaveProperty('id');
    expect(f.persist.mock.calls[1][1]?.visibility).toBe('private');
  });

  it('연결 버전을 owner 결과로 자기 갱신한 뒤 새 저장과 철회는 갱신된 CAS를 쓴다', async () => {
    const f = fixture(true);
    const controller = f.create();
    await controller.refresh();
    expect(f.read().socialCategoryVersion).toBe(3);
    f.saveCategory.mockResolvedValueOnce(
      answer({ ...canonical, visibility: 'friends', version: 4 }),
    );
    expect(await controller.change('friends')).toBe(true);
    expect(f.saveCategory.mock.calls[0][0].expectedVersion).toBe(3);
    expect(f.persist.mock.calls[1][1]?.socialCategoryVersion).toBe(3);
    expect(await controller.revoke()).toBe(true);
    expect(f.revokeCategory.mock.calls[0][0].expectedVersion).toBe(4);
    expect(f.persist.mock.calls[2][1]?.socialCategoryVersion).toBe(4);
    expect(f.read().socialCategoryId).toBeUndefined();
  });

  it('응답 소실 뒤 재열기와 외부 메타데이터 변경은 최초 CAS를 바꾸거나 덮어쓰지 않는다', async () => {
    const f = fixture();
    const first = f.create();
    await first.refresh();
    const submittedOrigin = {
      id: f.read().id,
      name: f.read().name,
      color: f.read().color,
      visibility: f.read().visibility,
    };
    f.saveCategory.mockRejectedValueOnce(new Error('응답 소실'));
    expect(await first.change('public')).toBe(false);
    const entry = f.recovery.list()[0];
    expect(entry.intent.original).toMatchObject(submittedOrigin);
    first.dispose();
    const edited = { ...f.read(), name: '다른 기기에서 수정한 이름' };
    f.replace(edited);
    const reopened = f.create();
    await reopened.refresh();
    expect(await reopened.retry()).toBe(false);
    expect(f.saveCategory.mock.calls[1]).toEqual(f.saveCategory.mock.calls[0]);
    expect(f.persist.mock.calls.at(-1)?.[1]).toMatchObject(submittedOrigin);
    expect(entry.intent.original).toMatchObject(submittedOrigin);
    expect(f.read()).toEqual(edited);
    expect(reopened.getSnapshot().error).toBe('conflict');
    expect(f.recovery.list()).toHaveLength(0);
  });
});
