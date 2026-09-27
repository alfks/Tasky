import { reactionAccess } from '@/domain/social/access';
import type {
  ActorFacts,
  FriendshipFacts,
  SocialErrorCode,
  SocialId,
} from '@/domain/social/social';

export type ReactionPlan =
  { ok: true; nextActive: boolean; changed: boolean } | { ok: false; code: SocialErrorCode };

/** toggle 대신 원하는 상태를 설정한다. DB는 현재 권한과 값을 한 문장 안에서 다시 판정한다. */
export function planReactionSet(
  actor: ActorFacts,
  authorId: SocialId,
  authorIsActive: boolean,
  friendship: FriendshipFacts,
  currentActive: boolean,
  desiredActive: boolean,
): ReactionPlan {
  const access = reactionAccess(actor, authorId, authorIsActive, friendship);
  if (!access.allowed) return { ok: false, code: access.code };
  return { ok: true, nextActive: desiredActive, changed: currentActive !== desiredActive };
}
