import { lazy, Suspense, useEffect, useState } from 'react';

import type { Category } from '@/domain/category/category';
import type { SocialCategoryView } from '@/domain/social/social';

import { getSocialRepository } from '@/repositories/container';

import {
  loadCategoryAudienceController,
  loadCategoryPublicationManager,
  clearPendingCategories,
  useCategoryPublication,
  useCategoryStore,
} from '@/features/category';
import type { PublicationRecovery } from '@/features/category';
import type { CategoryPublicationRequest } from '@/features/shell/hooks/useShellSocial';
import {
  acquireSocialSession,
  invalidateSocialSession,
  recheckSocialSession,
  captureSocialDispatch,
  onSocialInvalidation,
  onSocialReady,
} from '@/features/social';
import type { SocialSessionScope } from '@/features/social';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { pushToast } from '@/components/ui/Toast';

type CategoryPublicationWorkspaceProps = {
  request: CategoryPublicationRequest;
  onDone: (confirmed: boolean) => void;
  onStartSocial: () => void;
};

export function CategoryPublicationWorkspace(props: CategoryPublicationWorkspaceProps) {
  const publication = useCategoryPublication();
  const [initial] = useState(() => ({
    kind: props.request.kind,
    registerPending: publication.registerPendingCategories,
  }));
  const [scope, setScope] = useState<SocialSessionScope | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    const implementation =
      initial.kind === 'manage'
        ? loadCategoryPublicationManager()
        : loadCategoryAudienceController();
    void implementation
      .then((module) => {
        if (!alive) return;
        const recovery = module.categoryPublicationRecovery;
        bindRecoveryLifetime(recovery);
        initial.registerPending?.(() => {
          if (!captureSocialDispatch()() || recovery.actor() === null) return null;
          return recovery
            .list()
            .filter((entry) => entry.namespace.startsWith('local:'))
            .map((entry) => entry.namespace.slice(6));
        }, recovery.subscribe);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    let release: (() => void) | undefined;
    void acquireSocialSession().then((acquired) => {
      if (!alive) {
        acquired?.release();
        return;
      }
      if (acquired === null) setFailed(true);
      else {
        release = acquired.release;
        setScope(acquired.scope);
      }
    });
    return () => {
      alive = false;
      release?.();
    };
  }, [initial]);
  if (scope !== null) return <CategoryPublicationReady {...props} />;
  return (
    <Dialog
      open
      title="카테고리 공개 범위 확인"
      onClose={() => props.onDone(false)}
      footer={
        <Button variant="outline" onClick={() => props.onDone(false)}>
          취소
        </Button>
      }
    >
      <p role={failed ? 'alert' : 'status'}>
        {failed
          ? '공개 범위를 확인하지 못했어요. 인터넷 연결과 로그인을 확인하고 다시 시도해 주세요.'
          : '공개 범위를 확인하고 있어요.'}
      </p>
    </Dialog>
  );
}

const CategoryAudienceController = lazy(() =>
  loadCategoryAudienceController().then((module) => ({
    default: module.CategoryAudienceController,
  })),
);

function CategoryPublicationReady({
  request,
  onDone,
  onStartSocial,
}: CategoryPublicationWorkspaceProps) {
  const publication = useCategoryPublication();
  const categories = useCategoryStore((state) => state.byId);
  if (request.kind === 'manage')
    return (
      <Suspense fallback={<p role="status">공유 카테고리를 불러오는 중</p>}>
        <CategoryPublicationManager
          dependencies={{
            repository: getSocialRepository,
            capture: captureSocialDispatch,
            online: () => navigator.onLine && !document.hidden,
            getLocal: (id) => useCategoryStore.getState().byId[id],
            listLocal: () => Object.values(useCategoryStore.getState().byId),
            persist: persistCanonical,
            subscribeInvalidation: onSocialInvalidation,
            onSessionFailure: failSession,
          }}
          onClose={() => onDone(false)}
          onConfirmed={(kind) => {
            if (kind === 'revoke') {
              pushToast({ message: '공유 카테고리를 철회했어요. 개인 할 일은 그대로예요.' });
              onDone(false);
              invalidateSocialSession('revoked');
              void recheckSocialSession();
            }
          }}
        />
      </Suspense>
    );
  void categories;
  return (
    <Suspense fallback={<p role="status">공개 범위를 확인하고 있어요.</p>}>
      <CategoryAudienceController
        category={request.category}
        kind={request.kind}
        metadata={request.metadata}
        dependencies={{
          repository: getSocialRepository,
          capture: captureSocialDispatch,
          online: () => navigator.onLine && !document.hidden,
          persist: (canonical, origin, allowed) =>
            persistCanonical(canonical, origin ?? request.category, allowed),
          subscribeInvalidation: onSocialInvalidation,
          subscribeReady: onSocialReady,
          onSessionFailure: failSession,
        }}
        onDone={(confirmed) => {
          onDone(confirmed);
          if (confirmed) {
            invalidateSocialSession('revoked');
            void recheckSocialSession();
          }
        }}
        onStartSocial={onStartSocial}
        onManageCategories={() => {
          onDone(false);
          publication.openManager?.();
        }}
      />
    </Suspense>
  );
}

const CategoryPublicationManager = lazy(() =>
  loadCategoryPublicationManager().then((module) => ({
    default: module.CategoryPublicationManager,
  })),
);
let lifetimeRecovery: PublicationRecovery | null = null;
function bindRecoveryLifetime(recovery: PublicationRecovery) {
  if (lifetimeRecovery === recovery) return;
  lifetimeRecovery = recovery;
  onSocialInvalidation(recovery.lock);
  window.addEventListener('tasky-social-logout', () => {
    recovery.purge();
    clearPendingCategories();
  });
}
function failSession(code: 'unauthorized' | 'account-deleted') {
  invalidateSocialSession(code === 'unauthorized' ? 'auth' : 'account');
}
function persistCanonical(
  canonical: SocialCategoryView | null,
  original?: Category,
  commandAllowed?: () => boolean,
): Promise<boolean> {
  if (original === undefined) return Promise.resolve(false);
  const active = captureSocialDispatch();
  const allowed = () => {
    const latest = useCategoryStore.getState().byId[original.id];
    return (
      active() &&
      (commandAllowed?.() ?? true) &&
      latest !== undefined &&
      latest.socialCategoryId === original.socialCategoryId &&
      latest.socialCategoryVersion === original.socialCategoryVersion &&
      latest.visibility === original.visibility &&
      latest.name === original.name &&
      latest.color === original.color &&
      latest.emoji === original.emoji
    );
  };
  return useCategoryStore.getState().confirmAudience(original.id, canonical, allowed);
}
