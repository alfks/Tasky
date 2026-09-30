import type { SocialRepository } from '@/repositories/social-repository';

export type SocialDispatchGuard = () => boolean;

function cancelled(): Error {
  const error = new Error('소셜 세션이 변경됐습니다.');
  error.name = 'AbortError';
  return error;
}

/** 실제 구현은 첫 호출에만 가져오고, 기다리는 사이 계정·뷰가 바뀌면 발송하지 않는다. */
export function createLazySocialRepository(
  load: () => Promise<SocialRepository>,
  captureCanDispatch: () => SocialDispatchGuard,
): SocialRepository {
  let pending: Promise<SocialRepository> | undefined;
  async function dispatch<T>(invoke: (repository: SocialRepository) => Promise<T>): Promise<T> {
    const canDispatch = captureCanDispatch();
    if (!canDispatch()) throw cancelled();
    pending ??= load().catch((error: unknown) => {
      pending = undefined;
      throw error;
    });
    const repository = await pending;
    if (!canDispatch()) throw cancelled();
    return invoke(repository);
  }

  return {
    me: () => dispatch((r) => r.me()),
    categories: (page) => dispatch((r) => r.categories(page)),
    category: (input) => dispatch((r) => r.category(input)),
    saveCategory: (input, options) => dispatch((r) => r.saveCategory(input, options)),
    revokeCategory: (input, options) => dispatch((r) => r.revokeCategory(input, options)),
    createProfile: (input) => dispatch((r) => r.createProfile(input)),
    renameProfile: (input, options) => dispatch((r) => r.renameProfile(input, options)),
    friends: (page) => dispatch((r) => r.friends(page)),
    requests: (direction, page) => dispatch((r) => r.requests(direction, page)),
    createInvite: (options) => dispatch((r) => r.createInvite(options)),
    invites: (page) => dispatch((r) => r.invites(page)),
    revokeInvite: (input, options) => dispatch((r) => r.revokeInvite(input, options)),
    previewInvite: (input) => dispatch((r) => r.previewInvite(input)),
    sendRequest: (input, options) => dispatch((r) => r.sendRequest(input, options)),
    acceptRequest: (input, options) => dispatch((r) => r.acceptRequest(input, options)),
    declineRequest: (input, options) => dispatch((r) => r.declineRequest(input, options)),
    cancelRequest: (input, options) => dispatch((r) => r.cancelRequest(input, options)),
    removeFriend: (input, options) => dispatch((r) => r.removeFriend(input, options)),
    blocks: (page) => dispatch((r) => r.blocks(page)),
    setBlock: (input, options) => dispatch((r) => r.setBlock(input, options)),
    feed: (page) => dispatch((r) => r.feed(page)),
    validatePosts: (input) => dispatch((r) => r.validatePosts(input)),
    myPosts: (page) => dispatch((r) => r.myPosts(page)),
    createPost: (input, options) => dispatch((r) => r.createPost(input, options)),
    deletePost: (input, options) => dispatch((r) => r.deletePost(input, options)),
    setReaction: (input, options) => dispatch((r) => r.setReaction(input, options)),
  };
}
