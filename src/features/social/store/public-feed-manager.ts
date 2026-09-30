import type { PublicSocialRepository } from '@/repositories/social-repository';

import type { FeedSnapshot } from '@/features/social/lib/feed-validation';
import type { FeedClock } from '@/features/social/lib/validate-page';
import { createSocialFeedManager } from '@/features/social/store/feed-manager';

export type PublicFeedSnapshot = Omit<FeedSnapshot, 'profile' | 'mode' | 'view'>;
export type PublicFeedDependencies = {
  repository: () => PublicSocialRepository;
  clock: FeedClock;
  online: () => boolean;
  visible: () => boolean;
};

/** 공개 진입은 인증 세션을 만들거나 개인 저장소를 호출하지 않는다. */
export function createPublicFeedManager(
  deps: PublicFeedDependencies,
  onChange: (snapshot: PublicFeedSnapshot) => void,
) {
  const manager = createSocialFeedManager({ ...deps, anonymous: true }, (next) => {
    snapshot = withoutIdentity(next);
    onChange(snapshot);
  });
  let snapshot = withoutIdentity(manager.getSnapshot());
  return {
    getSnapshot: () => snapshot,
    visibleItems: manager.visibleItems,
    open: manager.open,
    close: manager.close,
    refresh: manager.refresh,
    next: manager.next,
    previous: manager.previous,
    invalidate: () => manager.invalidate('recheck'),
  };
}

function withoutIdentity(snapshot: FeedSnapshot): PublicFeedSnapshot {
  const { profile: _profile, mode: _mode, view: _view, ...publicState } = snapshot;
  return publicState;
}
