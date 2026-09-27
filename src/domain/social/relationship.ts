import type { SocialErrorCode, SocialId } from '@/domain/social/social';

export type PairState = 'none' | 'pending' | 'accepted';
export type Pair = {
  lo: SocialId;
  hi: SocialId;
  state: PairState;
  requesterId: SocialId | null;
  requestedAt: number | null;
  version: number;
};
export type PairAction =
  'request' | 'accept' | 'decline' | 'cancel' | 'remove' | 'block' | 'unblock';
export type PairFacts = {
  actorId: SocialId;
  peerId: SocialId;
  pair: Pair | undefined;
  action: PairAction;
  expectedVersion?: number;
  nowMs: number;
  isBlockedByActor: boolean;
  isBlockedByPeer: boolean;
  actorFriendCount: number;
  peerFriendCount: number;
};
export type PairPlan =
  | { ok: true; pair: Pair; setBlock?: boolean; clearReactions: boolean }
  | { ok: false; code: SocialErrorCode };

const REQUEST_MS = 7 * 24 * 60 * 60 * 1000;

export function isPendingExpired(pair: Pair, nowMs: number): boolean {
  return (
    pair.state === 'pending' && pair.requestedAt !== null && nowMs >= pair.requestedAt + REQUEST_MS
  );
}

/** 다음 관련 쓰기가 호출하는 만료 정리 계획. 0행이면 version을 올리지 않는다. */
export function planExpiredPairCleanup(pair: Pair, nowMs: number): Pair | null {
  return isPendingExpired(pair, nowMs) ? changed(pair, 'none', null, nowMs) : null;
}

/** JS 문자열의 코드 단위 순서로 고정하며 locale 정렬을 쓰지 않는다. */
export function pairIds(a: SocialId, b: SocialId): { lo: SocialId; hi: SocialId } {
  return a < b ? { lo: a, hi: b } : { lo: b, hi: a };
}

function currentPair(facts: PairFacts): Pair {
  return (
    facts.pair ?? {
      ...pairIds(facts.actorId, facts.peerId),
      state: 'none',
      requesterId: null,
      requestedAt: null,
      version: 0,
    }
  );
}

function changed(pair: Pair, state: PairState, requesterId: SocialId | null, nowMs: number): Pair {
  return {
    ...pair,
    state,
    requesterId,
    requestedAt: state === 'pending' ? nowMs : null,
    version: pair.version + 1,
  };
}

/** SQL command의 조건부 판정과 같은 기대 결과를 만드는 순수 계획이다. */
export function planPairChange(facts: PairFacts): PairPlan {
  const { actorId, peerId, action, nowMs } = facts;
  if (actorId === peerId || !Number.isSafeInteger(nowMs)) return { ok: false, code: 'validation' };
  const pair = currentPair(facts);
  const ids = pairIds(actorId, peerId);
  if (pair.lo !== ids.lo || pair.hi !== ids.hi) return { ok: false, code: 'unavailable' };
  if (action === 'block') {
    return {
      ok: true,
      pair: changed(pair, 'none', null, nowMs),
      setBlock: true,
      clearReactions: true,
    };
  }
  if (facts.expectedVersion !== undefined && facts.expectedVersion !== pair.version) {
    return { ok: false, code: 'conflict' };
  }
  if (action === 'unblock') {
    if (!facts.isBlockedByActor || facts.expectedVersion === undefined) {
      return { ok: false, code: 'conflict' };
    }
    return {
      ok: true,
      pair: changed(pair, 'none', null, nowMs),
      setBlock: false,
      clearReactions: false,
    };
  }
  if (facts.isBlockedByActor || facts.isBlockedByPeer) return { ok: false, code: 'unavailable' };
  if (action === 'request') {
    if (isPendingExpired(pair, nowMs)) return { ok: false, code: 'request-expired' };
    if (pair.state === 'pending') return { ok: false, code: 'request-pending' };
    if (pair.state !== 'none') return { ok: false, code: 'conflict' };
    return { ok: true, pair: changed(pair, 'pending', actorId, nowMs), clearReactions: false };
  }
  if (action === 'remove') {
    if (pair.state !== 'accepted' || facts.expectedVersion === undefined) {
      return { ok: false, code: 'conflict' };
    }
    return { ok: true, pair: changed(pair, 'none', null, nowMs), clearReactions: true };
  }
  if (pair.state !== 'pending' || facts.expectedVersion === undefined) {
    return { ok: false, code: 'conflict' };
  }
  if (pair.requestedAt === null || isPendingExpired(pair, nowMs)) {
    return { ok: false, code: 'request-expired' };
  }
  if (action === 'cancel' && pair.requesterId !== actorId)
    return { ok: false, code: 'unavailable' };
  if ((action === 'accept' || action === 'decline') && pair.requesterId !== peerId) {
    return { ok: false, code: 'unavailable' };
  }
  if (action === 'accept') {
    if (facts.actorFriendCount >= 50 || facts.peerFriendCount >= 50) {
      return { ok: false, code: 'limit-reached' };
    }
    return { ok: true, pair: changed(pair, 'accepted', null, nowMs), clearReactions: false };
  }
  return { ok: true, pair: changed(pair, 'none', null, nowMs), clearReactions: false };
}
