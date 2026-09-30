import {
  planPairChange,
  pairIds,
  type Pair,
  type PairAction,
  type PairFacts,
  type PairPlan,
} from '@/domain/social/relationship';
import type {
  FriendView,
  Page,
  PageInput,
  PairResult,
  ProfileView,
  RequestView,
  SocialId,
} from '@/domain/social/social';

import { keyPage } from '@/repositories/memory/social/cursor';
import { actor, fail, type MemorySocialState } from '@/repositories/memory/social/model';

export function pairKey(a: SocialId, b: SocialId): string {
  const { lo, hi } = pairIds(a, b);
  return `${lo}:${hi}`;
}

export function blockKey(actorId: SocialId, peerId: SocialId): string {
  return `${actorId}:${peerId}`;
}

export function profileById(state: MemorySocialState, id: SocialId): ProfileView | undefined {
  return [...state.profiles.entries()].find(
    ([sub, value]) => value.id === id && !state.deleted.has(sub),
  )?.[1];
}

export function isFriend(state: MemorySocialState, a: SocialId, b: SocialId): boolean {
  return (
    state.pairs.get(pairKey(a, b))?.state === 'accepted' &&
    !state.blocks.has(blockKey(a, b)) &&
    !state.blocks.has(blockKey(b, a))
  );
}

function friendCount(state: MemorySocialState, id: SocialId): number {
  return [...state.pairs.values()].filter(
    (pair) => pair.state === 'accepted' && (pair.lo === id || pair.hi === id),
  ).length;
}

export function clearPairReactions(state: MemorySocialState, a: SocialId, b: SocialId): void {
  for (const key of state.reactions) {
    const [reactorId, postId] = key.split(':');
    const authorId = state.posts.get(postId)?.authorId;
    if ((reactorId === a && authorId === b) || (reactorId === b && authorId === a)) {
      state.reactions.delete(key);
    }
  }
}

/** 포트 명령과 계약 벡터가 같은 전이 경로를 사용한다. */
export function applyPairFacts(state: MemorySocialState, facts: PairFacts): PairPlan {
  const plan = planPairChange(facts);
  if (!plan.ok) return plan;
  state.pairs.set(pairKey(facts.actorId, facts.peerId), plan.pair);
  if (plan.setBlock === true) state.blocks.add(blockKey(facts.actorId, facts.peerId));
  if (plan.setBlock === false) state.blocks.delete(blockKey(facts.actorId, facts.peerId));
  if (plan.clearReactions) clearPairReactions(state, facts.actorId, facts.peerId);
  return plan;
}

export function transition(
  state: MemorySocialState,
  sub: string,
  peerId: SocialId,
  action: PairAction,
  expectedVersion?: number,
): PairResult {
  const self = actor(state, sub);
  const peer = profileById(state, peerId);
  if (peer === undefined) return fail('unavailable', state.now());
  const key = pairKey(self.id, peerId);
  const old = state.pairs.get(key);
  const plan = applyPairFacts(state, {
    actorId: self.id,
    peerId,
    pair: old,
    action,
    expectedVersion,
    nowMs: state.now(),
    isBlockedByActor: state.blocks.has(blockKey(self.id, peerId)),
    isBlockedByPeer: state.blocks.has(blockKey(peerId, self.id)),
    actorFriendCount: friendCount(state, self.id),
    peerFriendCount: friendCount(state, peerId),
  });
  if (!plan.ok) return fail(plan.code, state.now());
  return { peerId, pairVersion: plan.pair.version, state: plan.pair.state };
}

export function friends(
  state: MemorySocialState,
  sub: string,
  input?: PageInput,
): Page<FriendView> {
  const self = actor(state, sub);
  const items = [...state.pairs.values()]
    .filter((pair) => pair.state === 'accepted' && (pair.lo === self.id || pair.hi === self.id))
    .map((pair) => {
      const peerId = pair.lo === self.id ? pair.hi : pair.lo;
      const peer = profileById(state, peerId);
      if (peer === undefined || !isFriend(state, self.id, peerId)) return null;
      return { id: peer.id, nickname: peer.nickname, pairVersion: pair.version };
    })
    .filter((item): item is FriendView => item !== null)
    .sort((a, b) => a.id.localeCompare(b.id));
  return keyPage(state, self.id, 'friends', items, input, (item) => item.id);
}

export function requests(
  state: MemorySocialState,
  sub: string,
  direction: 'incoming' | 'outgoing',
  input?: PageInput,
): Page<RequestView> {
  const self = actor(state, sub);
  const items: RequestView[] = [];
  for (const pair of state.pairs.values()) {
    if (pair.state !== 'pending' || pair.requesterId === null || pair.requestedAt === null)
      continue;
    const isSender = pair.requesterId === self.id;
    const isReceiver = (pair.lo === self.id || pair.hi === self.id) && !isSender;
    if ((direction === 'outgoing' && !isSender) || (direction === 'incoming' && !isReceiver))
      continue;
    const peerId = isSender ? (pair.lo === self.id ? pair.hi : pair.lo) : pair.requesterId;
    const peer = profileById(state, peerId);
    if (peer === undefined || state.now() >= pair.requestedAt + 7 * 24 * 60 * 60 * 1000) continue;
    items.push({
      peer: { id: peer.id, nickname: peer.nickname },
      pairVersion: pair.version,
      expiresAt: pair.requestedAt + 7 * 24 * 60 * 60 * 1000,
    });
  }
  return keyPage(
    state,
    self.id,
    `requests:${direction}`,
    items.sort((a, b) => a.peer.id.localeCompare(b.peer.id)),
    input,
    (item) => item.peer.id,
  );
}

export function blocks(state: MemorySocialState, sub: string, input?: PageInput): Page<FriendView> {
  const self = actor(state, sub);
  const items: FriendView[] = [];
  for (const key of state.blocks) {
    const [blocker, peerId] = key.split(':');
    if (blocker !== self.id) continue;
    const peer = profileById(state, peerId);
    if (peer !== undefined)
      items.push({
        id: peer.id,
        nickname: peer.nickname,
        pairVersion: state.pairs.get(pairKey(self.id, peer.id))?.version ?? 0,
      });
  }
  return keyPage(
    state,
    self.id,
    'blocks',
    items.sort((a, b) => a.id.localeCompare(b.id)),
    input,
    (item) => item.id,
  );
}

export function pairFor(state: MemorySocialState, a: SocialId, b: SocialId): Pair | undefined {
  return state.pairs.get(pairKey(a, b));
}
