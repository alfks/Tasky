/** Phase 3 온라인 공유의 공개 값 타입. 개인 동기화 엔티티와 별개다(ADR-0022). */
export type SocialId = string;
import type { CategoryVisibility } from '@/domain/category/visibility';

export type SocialCategoryView = {
  /** Owner cleanup에서만 보이는 tombstone; 공개/친구 DTO에서는 생략한다. */
  revoked?: boolean;
  id: SocialId;
  name: string;
  color: string;
  emoji?: string;
  visibility: CategoryVisibility;
  version: number;
  updatedAt: number;
  /** 소유자 관리 응답에만 포함한다. */
  postCount?: number;
};
export type SocialCategoryInput = {
  id?: SocialId;
  expectedVersion: number;
  name: string;
  color: string;
  emoji?: string;
  visibility: CategoryVisibility;
};
export type SocialMode = 'off' | 'read-only' | 'enabled';
export type SocialErrorCode =
  | 'unauthorized'
  | 'account-deleted'
  | 'csrf'
  | 'unavailable'
  | 'conflict'
  | 'request-pending'
  | 'idempotency-conflict'
  | 'request-expired'
  | 'validation'
  | 'limit-reached'
  | 'rate-limited'
  | 'social-disabled'
  | 'temporary';

export type ProfileView = { id: SocialId; nickname: string; version: number };
export type SocialMe = { profile: ProfileView | null; mode: SocialMode };
export type PeerView = Pick<ProfileView, 'id' | 'nickname'>;
export type FriendView = PeerView & { pairVersion: number };
export type RequestView = {
  peer: PeerView;
  pairVersion: number;
  expiresAt: number;
};
export type InviteView = {
  inviteId: string;
  status: 'active' | 'used' | 'revoked' | 'expired';
  expiresAt: number;
};
export type PairResult = {
  peerId: SocialId;
  pairVersion: number;
  state: 'none' | 'pending' | 'accepted';
};
export type InviteCreated =
  { token: string; expiresAt: number } | { inviteId: string; tokenUnavailable: true };
export type PostInput = {
  text: string;
  happenedOn: string;
  /** 둘 다 없는 옛 클라이언트만 기존 friends 사본으로 처리한다. */
  categoryId?: SocialId;
  categoryVersion?: number;
};
export type PostView = {
  id: SocialId;
  author: PeerView;
  text: string;
  happenedOn: string;
  createdAt: number;
  reactionCount: number;
  myReaction: boolean;
  category?: SocialCategoryView;
};
export type Page<T> = { items: readonly T[]; nextCursor: string | null };
export type PageInput = { cursor?: string; limit?: number };
export type PublicPageInput = PageInput & { categoryId?: SocialId };
export type SocialResponse<T> = { data: T; serverTime: number };

/** `Actor`는 검증된 세션으로 어댑터가 만든다. 클라이언트 DTO에는 절대 포함하지 않는다. */
export type ActorFacts = {
  actorId: SocialId;
  isSessionActive: boolean;
  isAccountActive: boolean;
  isProfileActive: boolean;
};

export type FriendshipFacts = {
  isAccepted: boolean;
  isPeerActive: boolean;
  isBlockedByActor: boolean;
  isBlockedByPeer: boolean;
};
