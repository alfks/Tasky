import { parsePostInput } from '@/domain/social/input';
import type {
  FriendshipFacts,
  Page,
  PageInput,
  PostInput,
  PostView,
  SocialId,
} from '@/domain/social/social';

import { categoryReadable, categoryView } from '@/repositories/memory/social/categories';
import { keyPage } from '@/repositories/memory/social/cursor';
import {
  actor,
  fail,
  nextId,
  type MemoryPost,
  type MemorySocialState,
} from '@/repositories/memory/social/model';
import { blockKey, isFriend, profileById } from '@/repositories/memory/social/relations';

function friendship(
  state: MemorySocialState,
  actorId: SocialId,
  authorId: SocialId,
): FriendshipFacts {
  return {
    isAccepted: isFriend(state, actorId, authorId),
    isPeerActive: profileById(state, authorId) !== undefined,
    isBlockedByActor: state.blocks.has(blockKey(actorId, authorId)),
    isBlockedByPeer: state.blocks.has(blockKey(authorId, actorId)),
  };
}

export function postReadable(
  state: MemorySocialState,
  viewerId: string | null,
  post: MemoryPost,
): boolean {
  if (post.category !== undefined) return categoryReadable(state, post.category.id, viewerId);
  if (viewerId === null) return false;
  const friend = friendship(state, viewerId, post.authorId);
  return (
    profileById(state, post.authorId) !== undefined &&
    (viewerId === post.authorId ||
      (friend.isAccepted && !friend.isBlockedByActor && !friend.isBlockedByPeer))
  );
}

function canRead(state: MemorySocialState, sub: string, post: MemoryPost): boolean {
  const self = actor(state, sub);
  return postReadable(state, self.id, post);
}

export function postView(
  state: MemorySocialState,
  viewerId: string | null,
  post: MemoryPost,
): PostView {
  const { authorId, ...sharedFields } = post;
  const author = profileById(state, authorId);
  if (author === undefined) return fail('unavailable', state.now());
  const reactionCount = [...state.reactions].filter((key) => {
    const [reactorId, postId] = key.split(':');
    return (
      postId === post.id &&
      reactorId !== post.authorId &&
      profileById(state, reactorId) !== undefined &&
      postReadable(state, reactorId, post)
    );
  }).length;
  return {
    ...sharedFields,
    author: { id: author.id, nickname: author.nickname },
    reactionCount,
    myReaction:
      viewerId !== null &&
      postReadable(state, viewerId, post) &&
      state.reactions.has(`${viewerId}:${post.id}`),
    ...(post.category === undefined
      ? {}
      : { category: categoryView(state, post.category.id, null) }),
  };
}

function ordered(posts: Iterable<MemoryPost>): MemoryPost[] {
  return [...posts].sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id));
}

function postKey(post: PostView): string {
  return `${String(post.createdAt).padStart(16, '0')}:${post.id}`;
}

export function feed(state: MemorySocialState, sub: string, input?: PageInput): Page<PostView> {
  const self = actor(state, sub);
  if (state.mode === 'off') return fail('social-disabled', state.now());
  const visible = ordered(state.posts.values()).filter(
    (post) =>
      (post.authorId === self.id || isFriend(state, self.id, post.authorId)) &&
      canRead(state, sub, post),
  );
  return keyPage(
    state,
    self.id,
    'feed',
    visible.map((post) => postView(state, self.id, post)),
    input,
    postKey,
    'desc',
  );
}

export function mine(state: MemorySocialState, sub: string, input?: PageInput): Page<PostView> {
  const self = actor(state, sub);
  return keyPage(
    state,
    self.id,
    'mine',
    ordered(state.posts.values())
      .filter((post) => post.authorId === self.id)
      .map((post) => postView(state, self.id, post)),
    input,
    postKey,
    'desc',
  );
}

export function validate(
  state: MemorySocialState,
  sub: string,
  ids: readonly SocialId[],
): readonly SocialId[] {
  actor(state, sub);
  if (state.mode === 'off') return fail('social-disabled', state.now());
  return ids.filter((id) => {
    const post = state.posts.get(id);
    return post !== undefined && canRead(state, sub, post);
  });
}

export function createPost(state: MemorySocialState, sub: string, input: PostInput): SocialId {
  const self = actor(state, sub);
  if (state.mode !== 'enabled') return fail('social-disabled', state.now());
  const parsed = parsePostInput(input);
  if (!parsed.ok) return fail('validation', state.now());
  const category =
    parsed.value.categoryId === undefined
      ? undefined
      : state.categories.get(parsed.value.categoryId);
  if (
    parsed.value.categoryId !== undefined &&
    (category === undefined || category.ownerId !== self.id || category.deleted)
  )
    return fail('unavailable', state.now());
  if (category !== undefined && category.version !== parsed.value.categoryVersion)
    return fail('conflict', state.now());
  const ownPosts = [...state.posts.values()].filter((post) => post.authorId === self.id);
  const dayStart = Math.floor(state.now() / 86_400_000) * 86_400_000;
  if (ownPosts.length >= 1000 || ownPosts.filter((post) => post.createdAt >= dayStart).length >= 20)
    return fail('limit-reached', state.now());
  const id = nextId(state);
  state.posts.set(id, {
    id,
    authorId: self.id,
    text: parsed.value.text,
    happenedOn: parsed.value.happenedOn,
    createdAt: state.now(),
    ...(category === undefined ? {} : { category: categoryView(state, category.id, null) }),
  });
  return id;
}

export function deletePost(state: MemorySocialState, sub: string, id: SocialId): void {
  const self = actor(state, sub);
  const post = state.posts.get(id);
  if (post === undefined || post.authorId !== self.id) return;
  state.posts.delete(id);
  for (const key of state.reactions) {
    if (key.endsWith(`:${id}`)) state.reactions.delete(key);
  }
}

export function setReaction(
  state: MemorySocialState,
  sub: string,
  postId: SocialId,
  active: boolean,
): void {
  const self = actor(state, sub);
  const post = state.posts.get(postId);
  if (post === undefined) return fail('unavailable', state.now());
  if (active && state.mode !== 'enabled') return fail('social-disabled', state.now());
  const key = `${self.id}:${postId}`;
  if (post.authorId === self.id || (active && !postReadable(state, self.id, post)))
    return fail('unavailable', state.now());
  if (active) state.reactions.add(key);
  else state.reactions.delete(key);
}
