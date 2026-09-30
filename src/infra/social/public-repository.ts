import type { PublicSocialRepository } from '@/repositories/social-repository';

import { category } from '@/infra/social/category-decode';
import { allowed, page, post } from '@/infra/social/decode';
import { createSocialRequest } from '@/infra/social/request';

/** 공개 GET만 제공한다. 인증 쿠키 오류를 익명 요청으로 낮추지 않는다. */
export function createHttpPublicSocialRepository(
  transport: typeof fetch = fetch,
): PublicSocialRepository {
  const send = createSocialRequest(transport);
  return {
    feed: (input) =>
      send('/public/feed', (value) => page(value, post), {
        query: { cursor: input?.cursor, limit: input?.limit, categoryId: input?.categoryId },
      }),
    categories: (input) =>
      send('/public/categories', (value) => page(value, category), {
        query: { cursor: input?.cursor, limit: input?.limit },
      }),
    post: ({ id }) => send(`/public/posts/${id}`, post),
    validatePosts: ({ ids }) =>
      send('/public/posts/validate', allowed, { query: { ids: ids.join(',') } }),
  };
}
