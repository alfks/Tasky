import type {
  ActorFacts,
  FriendshipFacts,
  SocialErrorCode,
  SocialId,
} from '@/domain/social/social';

export type AccessResult = { allowed: true } | { allowed: false; code: SocialErrorCode };
const UNAVAILABLE: AccessResult = { allowed: false, code: 'unavailable' };

/** 인증 결과도 receipt 재확인 전마다 다시 검사한다. */
export function actorAccess(actor: ActorFacts): AccessResult {
  if (!actor.isSessionActive) return { allowed: false, code: 'unauthorized' };
  if (!actor.isAccountActive) return { allowed: false, code: 'account-deleted' };
  if (!actor.isProfileActive) return UNAVAILABLE;
  return { allowed: true };
}

/** 공개 조회는 비존재·비친구·차단을 같은 결과로 수렴시킨다. SQL에서도 재검사해야 한다. */
export function postReadAccess(
  actor: ActorFacts,
  authorId: SocialId,
  authorIsActive: boolean,
  friendship: FriendshipFacts,
): AccessResult {
  const active = actorAccess(actor);
  if (!active.allowed) return active;
  if (!authorIsActive) return UNAVAILABLE;
  if (actor.actorId === authorId) return { allowed: true };
  if (
    !friendship.isAccepted ||
    !friendship.isPeerActive ||
    friendship.isBlockedByActor ||
    friendship.isBlockedByPeer
  ) {
    return UNAVAILABLE;
  }
  return { allowed: true };
}

export function reactionAccess(
  actor: ActorFacts,
  authorId: SocialId,
  authorIsActive: boolean,
  friendship: FriendshipFacts,
): AccessResult {
  const read = postReadAccess(actor, authorId, authorIsActive, friendship);
  if (!read.allowed) return read;
  return actor.actorId === authorId ? UNAVAILABLE : read;
}

/** 자신의 공유 관리 목록은 친구 관계와 무관하게 소유자에게만 보인다. */
export function ownResourceAccess(actor: ActorFacts, ownerId: SocialId): AccessResult {
  const active = actorAccess(actor);
  if (!active.allowed) return active;
  return actor.actorId === ownerId ? { allowed: true } : UNAVAILABLE;
}
