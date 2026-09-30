import { useEffect, useState } from 'react';

import { getPublicSocialRepository } from '@/repositories/container';

import { browserFeedClock } from '@/features/social/lib/validate-page';
import { createPublicFeedManager } from '@/features/social/store/public-feed-manager';

export function usePublicFeed(categoryId?: string) {
  const [manager] = useState(() =>
    createPublicFeedManager(
      {
        repository: getPublicSocialRepository,
        clock: browserFeedClock,
        online: () => navigator.onLine,
        visible: () => !document.hidden,
      },
      (snapshot) => setSnapshot(snapshot),
    ),
  );
  const [snapshot, setSnapshot] = useState(manager.getSnapshot);
  useEffect(() => {
    void manager.open(categoryId);
    const resume = () => {
      manager.invalidate();
      if (navigator.onLine && !document.hidden) void manager.refresh();
      else manager.invalidate();
    };
    const channel =
      typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('tasky-social-session');
    if (channel !== null) channel.onmessage = resume;
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    window.addEventListener('offline', resume);
    document.addEventListener('visibilitychange', resume);
    return () => {
      channel?.close();
      manager.close();
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      window.removeEventListener('offline', resume);
      document.removeEventListener('visibilitychange', resume);
    };
  }, [manager, categoryId]);
  return {
    snapshot,
    items: manager.visibleItems(),
    refresh: manager.refresh,
    next: manager.next,
    previous: manager.previous,
  };
}
