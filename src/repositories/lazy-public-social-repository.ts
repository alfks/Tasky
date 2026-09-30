import type { PublicSocialRepository } from '@/repositories/social-repository';

/** 좁은 public read 포트만 지연 로드한다. 호출자의 화면 세대는 UI가 별도로 확인한다. */
export function createLazyPublicSocialRepository(
  load: () => Promise<PublicSocialRepository>,
): PublicSocialRepository {
  let pending: Promise<PublicSocialRepository> | undefined;
  async function dispatch<T>(invoke: (repo: PublicSocialRepository) => Promise<T>): Promise<T> {
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    return invoke(await pending);
  }
  return {
    feed: (page) => dispatch((repo) => repo.feed(page)),
    categories: (page) => dispatch((repo) => repo.categories(page)),
    post: (input) => dispatch((repo) => repo.post(input)),
    validatePosts: (input) => dispatch((repo) => repo.validatePosts(input)),
  };
}
