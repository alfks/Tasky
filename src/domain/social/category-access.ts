import type { CategoryVisibility } from '@/domain/category/visibility';

export type CategoryAccessFacts = {
  visibility: CategoryVisibility;
  ownerId: string;
  viewerId: string | null;
  ownerActive: boolean;
  categoryActive: boolean;
  viewerActive: boolean;
  friends: boolean;
  blocked: boolean;
};

/** 현재 category ACL. 익명 public 읽기와 인증된 양방향 차단을 구별한다. */
export function canReadCategory(facts: CategoryAccessFacts): boolean {
  if (!facts.ownerActive || !facts.categoryActive) return false;
  if (facts.viewerId === null) return facts.visibility === 'public';
  if (!facts.viewerActive) return false;
  if (facts.viewerId === facts.ownerId) return true;
  if (facts.blocked) return false;
  return facts.visibility === 'public' || (facts.visibility === 'friends' && facts.friends);
}

/** 타인의 현재 허용 사본에만 응원할 수 있다. 익명/자기 글은 금지한다. */
export function canReactToCategory(facts: CategoryAccessFacts): boolean {
  return facts.viewerId !== null && facts.viewerId !== facts.ownerId && canReadCategory(facts);
}
