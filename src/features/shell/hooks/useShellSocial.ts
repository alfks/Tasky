import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { Category } from '@/domain/category/category';

import {
  getPendingCategoryIds,
  subscribePendingCategoryIds,
  registerPendingCategories,
  clearPendingCategories,
} from '@/features/category';
import type { CategoryPublicationBridge } from '@/features/category';
import { onSocialInvalidation } from '@/features/social';

// 계정 폐기는 셸이 닫힌 동안에도 중립 표시를 비운다.
onSocialInvalidation((reason) => {
  if (reason === 'account') clearPendingCategories();
});

type AudienceRequest = {
  kind: 'scope' | 'metadata' | 'remove';
  category: Category;
  metadata?: { name: string; color: string; emoji?: string };
};
export type CategoryPublicationRequest = { key: string; resolve: (confirmed?: boolean) => void } & (
  AudienceRequest | { kind: 'manage' }
);

/** 확인 큐는 동기로 유지하고 화면 복귀 DOM 처리만 사용할 때 불러온다. */
export function useShellSocial(closeReports: () => void, onLoadError: () => void) {
  const initialPublic = useRef(new URLSearchParams(location.search).get('social') === 'public');
  const [socialOpen, setSocialOpen] = useState(
    () => initialPublic.current || hasPendingShellInvite(),
  );
  const pendingCategoryIds = useSyncExternalStore(
    subscribePendingCategoryIds,
    getPendingCategoryIds,
    getPendingCategoryIds,
  );
  const [request, setRequest] = useState<CategoryPublicationRequest | null>(null);
  const [actions] = useState(() => {
    const gate = {
      generation: 0,
      alive: true,
      sequence: 0,
      navigation: 0,
      opening: null as object | null,
      restore: null as (() => void) | null,
      pending: null as CategoryPublicationRequest | null,
    };
    const dismiss = (confirmed = false) => gate.pending?.resolve(confirmed);
    function enqueue(
      kind: CategoryPublicationRequest['kind'],
      category?: Category,
      metadata?: AudienceRequest['metadata'],
    ): Promise<boolean> {
      if (
        !gate.alive ||
        (kind !== 'scope' &&
          kind !== 'manage' &&
          category?.socialCategoryId === undefined &&
          !getPendingCategoryIds().includes(category!.id))
      )
        return Promise.resolve(gate.alive);
      dismiss();
      const generation = gate.generation;
      return new Promise((finish) => {
        const next: CategoryPublicationRequest = {
          key: `${generation}:${++gate.sequence}`,
          ...(kind === 'manage' ? { kind } : { kind, category: category!, metadata }),
          resolve: (confirmed = false) => {
            if (gate.pending !== next) return;
            gate.pending = null;
            if (gate.alive) setRequest(null);
            finish(confirmed && gate.alive && gate.generation === generation);
          },
        };
        gate.pending = next;
        setRequest(next);
      });
    }
    function invalidate() {
      gate.generation += 1;
      gate.navigation += 1;
      gate.opening = null;
      gate.restore = null;
      dismiss();
    }
    return {
      bridge: {
        openManager: () => {
          void enqueue('manage');
        },
        registerPendingCategories,
        openVisibility: (category: Category) => {
          void enqueue('scope', category);
        },
        beforeMetadataChange: (category: Category, metadata: AudienceRequest['metadata']) =>
          enqueue('metadata', category, metadata),
        beforeRemove: (category: Category) => enqueue('remove', category),
      } satisfies CategoryPublicationBridge,
      dismiss,
      openSocial: () => {
        if (gate.opening !== null || !gate.alive) return;
        const opening = {};
        gate.opening = opening;
        const generation = gate.generation;
        const opener = document.activeElement;
        void import('@/features/shell/components/SocialWorkspace')
          .then((module) => {
            if (!gate.alive || generation !== gate.generation || gate.opening !== opening) return;
            gate.restore = module.captureSocialReturn(opener);
            gate.opening = null;
            gate.navigation += 1;
            closeReports();
            setSocialOpen(true);
          })
          .catch(() => {
            if (gate.alive && generation === gate.generation && gate.opening === opening) {
              gate.opening = null;
              onLoadError();
            }
          });
      },
      returnFromSocial: () => {
        gate.opening = null;
        setSocialOpen(false);
        const generation = gate.generation;
        const navigation = ++gate.navigation;
        const restore = gate.restore;
        gate.restore = null;
        requestAnimationFrame(() => {
          if (gate.alive && generation === gate.generation && navigation === gate.navigation) {
            if (restore !== null) restore();
            else document.getElementById('shell-main')?.focus();
          }
        });
      },
      activate: () => {
        gate.alive = true;
      },
      invalidate,
      dispose: () => {
        gate.alive = false;
        invalidate();
      },
    };
  });
  useEffect(() => {
    actions.activate();
    window.addEventListener('tasky-social-invite', actions.openSocial);
    const stop = onSocialInvalidation((reason) => {
      if (['auth', 'account', 'revoked', 'provider', 'cross-tab'].includes(reason)) {
        actions.invalidate();
        try {
          if (reason !== 'provider') sessionStorage.removeItem('tasky.social.invite.v1');
        } catch {
          /* 저장 불가 탭에는 원문도 없다. */
        }
      }
    });
    return () => {
      window.removeEventListener('tasky-social-invite', actions.openSocial);
      stop();
      actions.dispose();
    };
  }, [actions]);
  return {
    socialOpen,
    request,
    ...actions,
    bridge: { ...actions.bridge, pendingCategoryIds },
    initialPublic: initialPublic.current,
  };
}

/** 저장이 차단되거나 오래된 탭 원문이면 개인 화면에서 시작한다. */
export function hasPendingShellInvite(): boolean {
  try {
    const encoded = sessionStorage.getItem('tasky.social.invite.v1');
    if (encoded === null) return false;
    const value: unknown = JSON.parse(encoded);
    return (
      typeof value === 'object' &&
      value !== null &&
      'savedAt' in value &&
      typeof value.savedAt === 'number' &&
      Date.now() - value.savedAt < 24 * 60 * 60 * 1000
    );
  } catch {
    return false;
  }
}
