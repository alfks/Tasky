/** 친구 화면 청크에서만 import한다. 공유 내용과 작성 초안은 탭 메모리에만 둔다. */
import { create } from 'zustand';

import type { PostView } from '@/domain/social/social';

import { getSocialRepository } from '@/repositories/container';

import type { FeedClock } from '@/features/social/lib/validate-page';
import {
  activateSocialSession,
  attachSocialClient,
  captureSocialDispatch,
  deactivateSocialSession,
  invalidateSocialSession,
} from '@/features/social/session-lifecycle';
import { createSocialFeedManager, type FeedSnapshot } from '@/features/social/store/feed-manager';

export type SocialStore = FeedSnapshot & {
  draft: string;
  retryKeys: Readonly<Record<string, string>>;
  open: () => Promise<void>;
  close: () => void;
  refresh: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  setDraft: (text: string) => void;
  /** 명시적 재시도만 같은 key를 쓴다. 성공 뒤에는 잊어버린다. */
  keyFor: (operation: string) => string;
  forgetKey: (operation: string) => void;
};

/** 만료 판정은 시스템 시각 변경의 영향을 받지 않는 경과 시간 축을 쓴다. */
export const socialFeedClock: FeedClock = {
  now: () => performance.now(),
  schedule: (run, ms) => window.setTimeout(run, ms),
  clear: (handle) => window.clearTimeout(handle as number),
};

const manager = createSocialFeedManager(
  {
    repository: getSocialRepository,
    clock: socialFeedClock,
    capture: captureSocialDispatch,
    activate: activateSocialSession,
    deactivate: deactivateSocialSession,
    attach: attachSocialClient,
    invalidateSession: invalidateSocialSession,
    online: () => navigator.onLine,
    visible: () => !document.hidden,
  },
  (feed) => {
    useSocialStore.setState(feed);
  },
  (reason) => {
    if (
      reason === 'auth' ||
      reason === 'account' ||
      reason === 'revoked' ||
      reason === 'cross-tab' ||
      reason === 'provider' ||
      reason === 'closed'
    ) {
      useSocialStore.setState({ draft: '', retryKeys: {} });
    }
  },
);

export const useSocialStore = create<SocialStore>()((set, get) => ({
  ...manager.getSnapshot(),
  draft: '',
  retryKeys: {},
  open: manager.open,
  close: manager.close,
  refresh: manager.refresh,
  next: manager.next,
  previous: manager.previous,
  setDraft: (draft) => set({ draft }),
  keyFor: (operation) => {
    const existing = get().retryKeys[operation];
    if (existing !== undefined) return existing;
    const key = `v1.${Date.now()}.${crypto.randomUUID().replaceAll('-', '')}`;
    set((state) => ({ retryKeys: { ...state.retryKeys, [operation]: key } }));
    return key;
  },
  forgetKey: (operation) =>
    set((state) => {
      const next = { ...state.retryKeys };
      delete next[operation];
      return { retryKeys: next };
    }),
}));

/** 렌더 순간에도 lease를 확인한다. 저장된 snapshot.items를 화면에서 직접 사용하지 않는다. */
export function useVisibleSocialPosts(): readonly PostView[] {
  useSocialStore((state) => state.items);
  useSocialStore((state) => state.canShow);
  return manager.visibleItems();
}
