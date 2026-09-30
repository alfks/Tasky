import { describe, expect, it, vi } from 'vitest';

import { createHttpPublicSocialRepository } from '@/infra/social/public-repository';

const ID = 'a'.repeat(32);
const CATEGORY = {
  id: ID,
  name: '공부',
  color: '#7CC6FF',
  visibility: 'public',
  version: 1,
  updatedAt: 1800000000000,
};
const result = (data: unknown) => new Response(JSON.stringify({ data, serverTime: 1800000000000 }));

describe('익명/선택 인증 공개 HTTP port', () => {
  it('공개 feed도 쿠키와 no-store를 유지하고 희소 페이지의 다음 cursor를 보존한다', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      result({ items: [], nextCursor: 'opaque' }),
    );
    const repo = createHttpPublicSocialRepository(fetcher);
    expect((await repo.feed({ categoryId: ID, limit: 3 })).data).toEqual({
      items: [],
      nextCursor: 'opaque',
    });
    expect(fetcher.mock.calls[0][0]).toBe(`/api/social/public/feed?limit=3&categoryId=${ID}`);
    expect(fetcher.mock.calls[0][1]).toMatchObject({
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
    });
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
  });
  it.each([401, 410])('%i 쿠키 실패를 익명 성공으로 낮추거나 재시도하지 않는다', async (status) => {
    const fetcher = vi.fn(async () => new Response('invalid session', { status }));
    await expect(createHttpPublicSocialRepository(fetcher).feed()).rejects.toMatchObject({
      code: status === 401 ? 'unauthorized' : 'account-deleted',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('visible id 검증은 GET으로 읽고 원본/body/command key를 전송하지 않는다', async () => {
    const fetcher = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      result({ allowedIds: [ID] }),
    );
    await createHttpPublicSocialRepository(fetcher).validatePosts({ ids: [ID] });
    expect(fetcher.mock.calls[0][0]).toBe(`/api/social/public/posts/validate?ids=${ID}`);
    expect(fetcher.mock.calls[0][1]?.body).toBeUndefined();
    expect(fetcher.mock.calls[0][1]?.headers).not.toHaveProperty('Idempotency-Key');
  });
  it.each([{ sourceCategoryId: 'private' }, { postCount: 2 }, { revoked: true }])(
    'category projection의 비공개 필드 %j를 거절한다',
    async (privateFields) => {
      const repo = createHttpPublicSocialRepository(async () =>
        result({ items: [{ ...CATEGORY, ...privateFields }], nextCursor: null }),
      );
      await expect(repo.categories()).rejects.toMatchObject({ code: 'temporary' });
    },
  );
});
