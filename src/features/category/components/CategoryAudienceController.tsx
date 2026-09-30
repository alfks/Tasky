import type { Category } from '@/domain/category/category';
import type { CategoryVisibility } from '@/domain/category/visibility';

import { CategoryAudienceDialog } from '@/features/category/components/CategoryAudienceDialog';
import { useCategoryAudience } from '@/features/category/hooks/useCategoryAudience';
import type { CategoryAudienceDependencies } from '@/features/category/store/category-audience';

export { publicationRecovery as categoryPublicationRecovery } from '@/features/category/store/category-publication-recovery';

type CategoryAudienceControllerProps = {
  category: Category;
  kind: 'scope' | 'metadata' | 'remove';
  metadata?: { name: string; color: string; emoji?: string };
  dependencies: CategoryAudienceDependencies;
  onDone: (confirmed: boolean) => void;
  onStartSocial: () => void;
  onManageCategories?: () => void;
};

export function CategoryAudienceController({
  category,
  kind,
  metadata,
  dependencies,
  onDone,
  onStartSocial,
  onManageCategories,
}: CategoryAudienceControllerProps) {
  const controller = useCategoryAudience(category, dependencies);
  const confirm = async (visibility: CategoryVisibility) => {
    const saved =
      kind === 'remove' ? await controller.revoke() : await controller.change(visibility, metadata);
    if (saved) onDone(true);
  };
  let message: string | null = null;
  const receiptBlocked =
    controller.error === 'request-expired' || controller.error === 'idempotency-conflict';
  if (controller.error === 'request-expired')
    message = '요청 확인 기간이 지났어요. 공유 카테고리 관리에서 서버의 현재 상태를 확인해 주세요.';
  else if (receiptBlocked)
    message =
      '같은 요청을 확인할 수 없어요. 공유 카테고리 관리에서 서버의 현재 상태를 확인해 주세요.';
  else if (controller.error === 'conflict')
    message = '다른 곳에서 공개 범위가 바뀌었어요. 새 범위를 확인한 뒤 다시 결정해 주세요.';
  else if (controller.uncertain)
    message =
      '완료 여부를 확인해야 해요. 마지막으로 확인한 범위를 보고 같은 요청으로 다시 확인해 주세요.';
  else if (controller.error !== null)
    message =
      '공개 범위를 확인하거나 변경하지 못했어요. 로그인과 인터넷 연결을 확인하고 다시 시도해 주세요.';
  const pendingSave = controller.pending?.kind === 'save' ? controller.pending.input : null;
  return (
    <CategoryAudienceDialog
      kind={kind}
      category={pendingSave ?? metadata ?? controller.confirmed ?? category}
      confirmed={controller.confirmed}
      mode={controller.mode}
      hasProfile={controller.profile !== null}
      checking={controller.phase === 'checking'}
      busy={controller.phase === 'saving'}
      error={message}
      unbound={category.socialCategoryId === undefined}
      uncertain={controller.uncertain}
      pendingVisibility={pendingSave?.visibility}
      retryAllowed={
        !receiptBlocked && (controller.pending?.kind === 'revoke' || controller.mode === 'enabled')
      }
      onRetry={() => {
        void controller.retry().then((confirmed) => {
          if (confirmed) onDone(true);
        });
      }}
      onConfirm={(visibility) => void confirm(visibility)}
      onClose={() => onDone(false)}
      onStartSocial={() => {
        onDone(false);
        onStartSocial();
      }}
      onRefresh={() => void controller.refresh()}
      onManageCategories={onManageCategories}
    />
  );
}
