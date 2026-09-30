import { StrictMode } from 'react';

import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { SocialCategoryView, SocialResponse } from '@/domain/social/social';

import type { SocialRepository } from '@/repositories/social-repository';

import { useCategoryAudience } from '@/features/category/hooks/useCategoryAudience';
import { createCategoryAudienceController } from '@/features/category/store/category-audience';
import { makeCategory } from '@/test/fixtures/category';

const canonical: SocialCategoryView = {
  id: 'a'.repeat(32),
  name: '공부',
  color: '#EF9A9A',
  visibility: 'friends',
  version: 3,
  updatedAt: 1,
  postCount: 7,
};
const answer = <T,>(data: T): SocialResponse<T> => ({ data, serverTime: 1 });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function fixture(linked = true) {
  let online = true;
  let identity = 1;
  let keyNumber = 0;
  const category = makeCategory(
    linked
      ? {
          name: canonical.name,
          color: canonical.color,
          visibility: 'friends',
          socialCategoryId: canonical.id,
          socialCategoryVersion: 1,
        }
      : { name: canonical.name, color: canonical.color },
  );
  const me = vi
    .fn<SocialRepository['me']>()
    .mockResolvedValue(
      answer({ profile: { id: 'b'.repeat(32), nickname: '내 별명', version: 1 }, mode: 'enabled' }),
    );
  const categories = vi
    .fn<SocialRepository['categories']>()
    .mockResolvedValue(answer({ items: [canonical], nextCursor: null }));
  const categoryRead = vi.fn<SocialRepository['category']>().mockResolvedValue(answer(canonical));
  const saveCategory = vi
    .fn<SocialRepository['saveCategory']>()
    .mockResolvedValue(answer({ ...canonical, visibility: 'public', version: 4 }));
  const revokeCategory = vi
    .fn<SocialRepository['revokeCategory']>()
    .mockResolvedValue(answer({ ...canonical, visibility: 'private', version: 4 }));
  const persist = vi.fn(async () => true);
  const deps = {
    repository: () =>
      ({
        me,
        categories,
        category: categoryRead,
        saveCategory,
        revokeCategory,
      }) as unknown as SocialRepository,
    capture: () => {
      const captured = identity;
      return () => captured === identity;
    },
    online: () => online,
    persist,
    key: () => `key-${++keyNumber}`,
  };
  const controller = createCategoryAudienceController(category, deps);
  return {
    controller,
    category,
    deps,
    me,
    categories,
    categoryRead,
    saveCategory,
    revokeCategory,
    persist,
    setOnline: (next: boolean) => {
      online = next;
    },
    changeIdentity: () => {
      identity += 1;
    },
  };
}

describe('카테고리 서버 범위와 명시적 변경', () => {
  it('복원된 연결의 소유권은 owner 페이지에서 확인하고 현재 버전과 사본 수를 사용한다', async () => {
    const f = fixture();
    f.categories.mockResolvedValueOnce(answer({ items: [], nextCursor: 'owner-next' }));
    await f.controller.refresh();
    expect(f.categories).toHaveBeenLastCalledWith({ limit: 50, cursor: 'owner-next' });
    expect(f.categoryRead).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot().confirmed).toEqual(canonical);
    expect(f.persist).toHaveBeenCalledWith(canonical);
    await f.controller.change('public');
    expect(f.saveCategory).toHaveBeenCalledWith(
      {
        id: canonical.id,
        expectedVersion: 3,
        name: canonical.name,
        color: canonical.color,
        visibility: 'public',
      },
      { key: 'key-1' },
    );
  });

  it('다른 소유자의 읽기 가능한 projection도 owner 목록에 없으면 연결을 지우고 private로 확인한다', async () => {
    const f = fixture();
    f.categories.mockResolvedValueOnce(answer({ items: [], nextCursor: null }));
    await f.controller.refresh();
    expect(f.controller.getSnapshot().confirmed).toBeNull();
    expect(f.persist).toHaveBeenCalledWith(null);
    expect(f.categoryRead).not.toHaveBeenCalled();
    expect(f.saveCategory).not.toHaveBeenCalled();
  });

  it('철회된 owner projection은 복원된 연결을 지우고 새 projection을 명시적으로 만든다', async () => {
    const f = fixture();
    f.categories.mockResolvedValueOnce(
      answer({ items: [{ ...canonical, visibility: 'private', revoked: true }], nextCursor: null }),
    );
    await f.controller.refresh();
    expect(f.controller.getSnapshot().confirmed).toBeNull();
    expect(f.persist).toHaveBeenCalledWith(null);
    await f.controller.change('public');
    expect(f.saveCategory.mock.calls[0][0]).not.toHaveProperty('id');
    expect(f.saveCategory.mock.calls[0][0].expectedVersion).toBe(0);
  });

  it('응답 소실의 재시도만 동일 입력과 key를 보내며 다른 공개 의도는 막는다', async () => {
    const f = fixture();
    await f.controller.refresh();
    f.saveCategory.mockRejectedValueOnce(new Error('응답 소실'));
    expect(await f.controller.change('public')).toBe(false);
    expect(f.controller.getSnapshot().confirmed).toEqual(canonical);
    expect(await f.controller.change('private')).toBe(false);
    expect(f.controller.getSnapshot().error).toBe('request-pending');
    expect(f.saveCategory).toHaveBeenCalledTimes(1);
    expect(await f.controller.change('public')).toBe(true);
    expect(f.saveCategory.mock.calls[1]).toEqual(f.saveCategory.mock.calls[0]);
    expect(f.controller.getSnapshot().confirmed?.visibility).toBe('public');
  });

  it('응답 소실 뒤 외부 철회의 tombstone 재생을 연결하지 않고 새 공개는 새 projection으로 확인한다', async () => {
    const f = fixture();
    await f.controller.refresh();
    f.saveCategory.mockRejectedValueOnce(new Error('응답 소실'));
    expect(await f.controller.change('public')).toBe(false);
    f.saveCategory.mockResolvedValueOnce(
      answer({ ...canonical, visibility: 'private', version: 5, revoked: true }),
    );
    expect(await f.controller.change('public')).toBe(false);
    expect(f.persist).toHaveBeenLastCalledWith(null);
    expect(f.controller.getSnapshot().confirmed).toBeNull();
    expect(f.controller.getSnapshot().error).toBe('conflict');
    expect(f.saveCategory.mock.calls[1]).toEqual(f.saveCategory.mock.calls[0]);
    expect(await f.controller.change('public')).toBe(true);
    expect(f.saveCategory.mock.calls[2][0]).not.toHaveProperty('id');
    expect(f.saveCategory.mock.calls[2][1].key).toBe('key-2');
  });

  it('409는 최신 범위를 읽되 재전송하지 않고 새 확인 클릭에 새 key를 쓴다', async () => {
    const f = fixture();
    await f.controller.refresh();
    f.saveCategory.mockRejectedValueOnce(
      Object.assign(new Error('오래된 버전'), { code: 'conflict' }),
    );
    f.categories.mockResolvedValueOnce(
      answer({ items: [{ ...canonical, version: 8, visibility: 'private' }], nextCursor: null }),
    );
    expect(await f.controller.change('public')).toBe(false);
    expect(f.controller.getSnapshot().error).toBe('conflict');
    expect(f.controller.getSnapshot().confirmed?.version).toBe(8);
    expect(f.saveCategory).toHaveBeenCalledTimes(1);
    await f.controller.change('public');
    expect(f.saveCategory.mock.calls[1][0].expectedVersion).toBe(8);
    expect(f.saveCategory.mock.calls[1][1].key).toBe('key-2');
  });

  it('공개 확대는 온라인 서버 성공 전까지 badge와 개인 연결을 바꾸지 않는다', async () => {
    const f = fixture();
    await f.controller.refresh();
    f.persist.mockClear();
    const pending = deferred<SocialResponse<SocialCategoryView>>();
    f.saveCategory.mockReturnValueOnce(pending.promise);
    const change = f.controller.change('public');
    expect(f.controller.getSnapshot().phase).toBe('saving');
    expect(f.controller.getSnapshot().confirmed?.visibility).toBe('friends');
    expect(f.persist).not.toHaveBeenCalled();
    pending.resolve(answer({ ...canonical, visibility: 'public', version: 4 }));
    expect(await change).toBe(true);
    expect(f.persist).toHaveBeenCalledWith(
      expect.objectContaining({ visibility: 'public', version: 4 }),
    );
  });

  it('계정 변경 뒤 늦은 저장 성공을 버리고 개인 연결을 저장하지 않는다', async () => {
    const f = fixture();
    await f.controller.refresh();
    f.persist.mockClear();
    const pending = deferred<SocialResponse<SocialCategoryView>>();
    f.saveCategory.mockReturnValueOnce(pending.promise);
    const change = f.controller.change('public');
    f.changeIdentity();
    f.controller.invalidate('account');
    pending.resolve(answer({ ...canonical, visibility: 'public', version: 4 }));
    expect(await change).toBe(false);
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot().confirmed).toBeNull();
    expect(f.controller.getSnapshot().profile).toBeNull();
  });

  it('오프라인에는 철회 성공과 개인 삭제 승인을 반환하지 않는다', async () => {
    const f = fixture();
    await f.controller.refresh();
    f.persist.mockClear();
    f.setOnline(false);
    expect(await f.controller.revoke()).toBe(false);
    expect(f.revokeCategory).not.toHaveBeenCalled();
    expect(f.persist).not.toHaveBeenCalled();
    expect(f.controller.getSnapshot().confirmed?.visibility).toBe('friends');
  });

  it('초기 reconciliation 실패는 나만 보기 성공이나 삭제 승인을 만들지 않는다', async () => {
    const f = fixture();
    f.categories.mockRejectedValueOnce(new Error('목록 연결 실패'));
    await f.controller.refresh();
    expect(await f.controller.change('private')).toBe(false);
    expect(await f.controller.revoke()).toBe(false);
    expect(f.persist).not.toHaveBeenCalled();
  });

  it('새 projection을 확인한 뒤 새로 읽어도 원래 무연결 상태로 돌아가지 않는다', async () => {
    const f = fixture(false);
    await f.controller.refresh();
    await f.controller.change('public');
    f.categories.mockResolvedValueOnce(
      answer({ items: [{ ...canonical, visibility: 'public', version: 4 }], nextCursor: null }),
    );
    await f.controller.refresh();
    expect(f.controller.getSnapshot().confirmed?.id).toBe(canonical.id);
    expect(f.categories).toHaveBeenCalledTimes(1);
  });

  it('off에서는 확인된 metadata를 유지하는 축소와 철회만 가능하다', async () => {
    const f = fixture();
    f.me.mockResolvedValueOnce(
      answer({ profile: { id: 'b'.repeat(32), nickname: '내 별명', version: 1 }, mode: 'off' }),
    );
    await f.controller.refresh();
    expect(await f.controller.change('public')).toBe(false);
    f.saveCategory.mockResolvedValueOnce(
      answer({ ...canonical, visibility: 'private', version: 4 }),
    );
    expect(await f.controller.change('private')).toBe(true);
    expect(f.saveCategory.mock.calls[0][0].name).toBe(canonical.name);
    expect(f.saveCategory.mock.calls[0][0].visibility).toBe('private');
  });
});

it('StrictMode의 효과 재실행과 부모 리렌더에도 scope controller를 사용할 수 있다', async () => {
  const f = fixture();
  const rendered = renderHook(() => useCategoryAudience(f.category, { ...f.deps }), {
    wrapper: StrictMode,
  });
  await act(async () => {
    for (let i = 0; i < 12; i += 1) await Promise.resolve();
  });
  expect(rendered.result.current.phase).toBe('ready');
  rendered.rerender();
  await act(async () => {
    expect(await rendered.result.current.change('public')).toBe(true);
  });
  expect(rendered.result.current.confirmed?.visibility).toBe('public');
  rendered.unmount();
});
