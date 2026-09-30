import { useEffect, useState, useSyncExternalStore } from 'react';

import type { Category } from '@/domain/category/category';

import {
  createCategoryAudienceController,
  type CategoryAudienceDependencies,
} from '@/features/category/store/category-audience';

/** 호출자는 대화상자별로 새 마운트와 인증된 세션 소유권을 제공한다. */
export function useCategoryAudience(category: Category, deps: CategoryAudienceDependencies) {
  const [{ controller, subscribeInvalidation, subscribeReady }] = useState(() => ({
    controller: createCategoryAudienceController(category, deps),
    subscribeInvalidation: deps.subscribeInvalidation,
    subscribeReady: deps.subscribeReady,
  }));
  const snapshot = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  useEffect(() => {
    controller.resume();
    const unsubscribe = subscribeInvalidation?.(controller.invalidate);
    const stopReady = subscribeReady?.(() => {
      void controller.refresh(true);
    });
    void controller.refresh();
    return () => {
      unsubscribe?.();
      stopReady?.();
      controller.dispose();
    };
  }, [controller, subscribeInvalidation, subscribeReady]);
  return {
    ...snapshot,
    loading: snapshot.phase === 'checking' || snapshot.phase === 'saving',
    refresh: controller.refresh,
    change: controller.change,
    revoke: controller.revoke,
    retry: controller.retry,
  };
}
