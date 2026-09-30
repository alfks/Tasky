import type { CategoryVisibility } from '@/domain/category/visibility';
import type { CategoryAccessFacts } from '@/domain/social/category-access';

export type VisibilityVector = {
  name: string;
  facts: CategoryAccessFacts;
  readable: boolean;
  reactive: boolean;
};
const OWNER = '00000000000000000000000000000001';
const PEER = '00000000000000000000000000000002';
const VIEWERS = ['owner', 'friend', 'stranger', 'anonymous', 'blocked'] as const;

/** domain/memory/실 D1에서 복사 없이 실행하는 현재 공개범위 매트릭스. */
export const VISIBILITY_READ_VECTORS: readonly VisibilityVector[] = (
  ['private', 'friends', 'public'] as const
).flatMap((visibility: CategoryVisibility) =>
  VIEWERS.map((viewer) => {
    const readable =
      viewer === 'owner' ||
      (visibility === 'public' && viewer !== 'blocked') ||
      (visibility === 'friends' && viewer === 'friend');
    return {
      name: `${visibility}/${viewer}`,
      facts: {
        visibility,
        ownerId: OWNER,
        viewerId: viewer === 'anonymous' ? null : viewer === 'owner' ? OWNER : PEER,
        ownerActive: true,
        categoryActive: true,
        viewerActive: true,
        friends: viewer === 'friend' || viewer === 'blocked',
        blocked: viewer === 'blocked',
      },
      readable,
      reactive: readable && viewer !== 'owner' && viewer !== 'anonymous',
    };
  }),
);
