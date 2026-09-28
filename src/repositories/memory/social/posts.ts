import { postReadAccess } from '@/domain/social/access';
import { parsePostInput } from '@/domain/social/input';
import { planReactionSet } from '@/domain/social/reaction';
import type {
  FriendshipFacts,
  Page,
  PageInput,
  OwnReactionView,
  PostInput,
  PostView,
  SocialId,
} from '@/domain/social/social';

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

function canRead(state: MemorySocialState, sub: string, post: MemoryPost): boolean {
  const self = actor(state, sub);
  const access = postReadAccess(
    {
      actorId: self.id,
      isSessionActive: true,
      isAccountActive: true,
      isProfileActive: true,
    },
    post.authorId,
    profileById(state, post.authorId) !== undefined,
    friendship(state, self.id, post.authorId),
  );
  return access.allowed;
}

function view(state: MemorySocialState, sub: string, post: MemoryPost): PostView {
  const { authorId, ...sharedFields } = post;
  const author = profileById(state, authorId);
  if (author === undefined) return fail('unavailable', state.now());
  const self = actor(state, sub);
  const reactionCount = [...state.reactions].filter((key) => {
    const [reactorId, postId] = key.split(':');
    return postId === post.id && isFriend(state, reactorId, post.authorId);
  }).length;
  return {
    ...sharedFields,
    author: { id: author.id, nickname: author.nickname },
    reactionCount,
    myReaction: state.reactions.has(`${self.id}:${post.id}`),
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
  const visible = ordered(state.posts.values()).filter((post) => canRead(state, sub, post));
  return keyPage(
    state,
    self.id,
    'feed',
    visible.map((post) => view(state, sub, post)),
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
      .map((post) => view(state, sub, post)),
    input,
    postKey,
    'desc',
  );
}

export function myReactions(
  state: MemorySocialState,
  sub: string,
  input?: PageInput,
): Page<OwnReactionView> {
  const self = actor(state, sub);
  const items = [...state.reactions]
    .filter((key) => key.startsWith(`${self.id}:`))
    .map((key) => ({ key, post: state.posts.get(key.slice(self.id.length + 1)) }))
    .flatMap(({ key, post }) =>
      post !== undefined && post.authorId !== self.id && canRead(state, sub, post)
        ? [{ postId: post.id, createdAt: state.reactionTimes.get(key) ?? 0 }]
        : [],
    )
    .sort((a, b) => a.postId.localeCompare(b.postId));
  return keyPage(state, self.id, 'reactions:mine', items, input, (item) => item.postId);
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
  const id = nextId(state);
  state.posts.set(id, {
    id,
    authorId: self.id,
    text: parsed.value.text,
    happenedOn: parsed.value.happenedOn,
    createdAt: state.now(),
  });
  return id;
}

export function deletePost(state: MemorySocialState, sub: string, id: SocialId): void {
  const self = actor(state, sub);
  const post = state.posts.get(id);
  if (post === undefined || post.authorId !== self.id) return;
  state.posts.delete(id);
  for (const key of state.reactions) {
    if (key.endsWith(`:${id}`)) {
      state.reactions.delete(key);
      state.reactionTimes.delete(key);
    }
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
  const result = planReactionSet(
    { actorId: self.id, isSessionActive: true, isAccountActive: true, isProfileActive: true },
    post.authorId,
    profileById(state, post.authorId) !== undefined,
    friendship(state, self.id, post.authorId),
    state.reactions.has(key),
    active,
  );
  if (!result.ok) return fail(result.code, state.now());
  if (result.nextActive) {
    state.reactions.add(key);
    if (!state.reactionTimes.has(key)) state.reactionTimes.set(key, state.now());
  } else {
    state.reactions.delete(key);
    state.reactionTimes.delete(key);
  }
}
