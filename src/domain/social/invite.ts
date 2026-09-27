import type { SocialErrorCode, SocialId } from '@/domain/social/social';

export type StoredInviteStatus = 'active' | 'used' | 'revoked';
export type InviteStatus = StoredInviteStatus | 'expired';
export type InviteFacts = {
  ownerId: SocialId;
  actorId: SocialId;
  status: StoredInviteStatus;
  expiresAt: number;
  nowMs: number;
  isBlocked: boolean;
  isAlreadyFriend: boolean;
  isAtLimit: boolean;
};
export type InvitePlan =
  { ok: true; nextStatus: 'used' | 'revoked' } | { ok: false; code: SocialErrorCode };

/** expired는 DB enum이 아니라 active와 서버 시각으로 계산한 표시 상태다. */
export function effectiveInviteStatus(
  status: StoredInviteStatus,
  expiresAt: number,
  nowMs: number,
): InviteStatus {
  return status === 'active' && nowMs >= expiresAt ? 'expired' : status;
}

/** 초대 원문을 소비하는 요청만 관계 생성과 같은 트랜잭션에서 이 계획을 확정한다. */
export function planInviteUse(facts: InviteFacts): InvitePlan {
  if (effectiveInviteStatus(facts.status, facts.expiresAt, facts.nowMs) !== 'active') {
    return { ok: false, code: 'unavailable' };
  }
  if (facts.ownerId === facts.actorId || facts.isBlocked || facts.isAlreadyFriend) {
    return { ok: false, code: 'unavailable' };
  }
  if (facts.isAtLimit) return { ok: false, code: 'limit-reached' };
  return { ok: true, nextStatus: 'used' };
}

export function planInviteRevoke(facts: InviteFacts): InvitePlan {
  if (facts.ownerId !== facts.actorId) return { ok: false, code: 'unavailable' };
  if (effectiveInviteStatus(facts.status, facts.expiresAt, facts.nowMs) !== 'active') {
    return { ok: false, code: 'unavailable' };
  }
  return { ok: true, nextStatus: 'revoked' };
}
