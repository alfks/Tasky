import { useRef, useState } from 'react';

import type { CategoryVisibility } from '@/domain/category/visibility';
import type { SocialCategoryView, SocialMode } from '@/domain/social/social';

import {
  CATEGORY_AUDIENCE_LABELS,
  CategoryAudiencePicker,
} from '@/features/category/components/CategoryAudiencePicker';
import type { PreparedPublication } from '@/features/category/store/category-publication-manager';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

type CategoryAudienceDialogProps = {
  kind: 'scope' | 'metadata' | 'remove';
  category: { name: string; color: string; emoji?: string };
  confirmed: SocialCategoryView | null;
  mode: SocialMode | null;
  hasProfile: boolean;
  checking: boolean;
  busy: boolean;
  error: string | null;
  unbound?: boolean;
  uncertain?: boolean;
  pendingVisibility?: CategoryVisibility;
  retryAllowed?: boolean;
  onRetry?: () => void;
  onManageCategories?: () => void;
  onConfirm: (visibility: CategoryVisibility) => void;
  onClose: () => void;
  onStartSocial: () => void;
  onRefresh: () => void;
};

export function CategoryAudienceDialog({
  kind,
  category,
  confirmed,
  mode,
  hasProfile,
  checking,
  busy,
  error,
  unbound = false,
  uncertain = false,
  pendingVisibility,
  retryAllowed = false,
  onRetry,
  onManageCategories,
  onConfirm,
  onClose,
  onStartSocial,
  onRefresh,
}: CategoryAudienceDialogProps) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [leaveAction, setLeaveAction] = useState<(() => void) | null>(null);
  const leave = (action: () => void) => {
    if (busy) return;
    if (uncertain) setLeaveAction(() => action);
    else action();
  };
  const [seenVersion, setSeenVersion] = useState(confirmed?.version);
  const [target, setTarget] = useState<CategoryVisibility>(confirmed?.visibility ?? 'private');
  // 새 서버 확인으로 범위가 달라져도 대화상자를 재마운트해 포커스를 잃지 않는다.
  if (!checking && !busy && seenVersion !== confirmed?.version) {
    setSeenVersion(confirmed?.version);
    setTarget(confirmed?.visibility ?? 'private');
  }
  const current = confirmed?.visibility ?? 'private';
  const desired =
    pendingVisibility ?? (kind === 'remove' ? 'private' : kind === 'metadata' ? current : target);
  const isCleanup = kind === 'remove' || desired === 'private';
  const disabled =
    checking ||
    busy ||
    !hasProfile ||
    mode === null ||
    (confirmed !== null && confirmed.postCount === undefined && !isCleanup) ||
    (mode !== 'enabled' && !isCleanup);
  let label = '나만 보기로 바꾸기';
  if (desired === 'friends') label = '친구에게 공개하기';
  if (desired === 'public') label = '모두에게 공개하기';
  if (kind === 'metadata') label = '변경 내용 공개하기';
  if (kind === 'remove') label = '공유 철회 후 삭제 계속';

  return (
    <>
      <Dialog
        open
        onClose={() => {
          leave(onClose);
        }}
        title={kind === 'remove' ? '공유된 카테고리를 철회할까요?' : '카테고리 공개 범위 확인'}
        initialFocusRef={cancelRef}
        footer={
          <>
            <Button
              ref={cancelRef}
              variant="outline"
              onClick={() => leave(onClose)}
              disabled={busy}
            >
              {uncertain ? '나중에 확인' : '취소'}
            </Button>
            <Button
              loading={busy}
              disabled={uncertain ? busy || !retryAllowed : disabled}
              onClick={() => (uncertain ? onRetry?.() : onConfirm(desired))}
            >
              {uncertain ? '같은 요청 다시 확인' : label}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-[var(--space-4)]">
          <p className="flex items-center gap-[var(--space-2)] text-base font-semibold break-words text-text">
            <span
              aria-hidden="true"
              style={{ backgroundColor: category.color }}
              className="inline-block size-[12px] shrink-0 rounded-full"
            />
            {category.emoji} {category.name}
          </p>
          <p className="text-sm text-muted">
            카테고리 이름과 직접 공유한 기록만 보여요. 원래 할 일과 메모는 공개되지 않아요.
          </p>
          {checking ? (
            <p role="status">공개 범위를 확인하고 있어요.</p>
          ) : (
            <>
              <p>
                {unbound && confirmed === null
                  ? '이 기기 설정 (서버 상태 미확인):'
                  : error !== null || busy
                    ? '마지막 확인 범위:'
                    : '현재 범위:'}{' '}
                {CATEGORY_AUDIENCE_LABELS[current]}
              </p>
              {kind === 'scope' ? (
                <CategoryAudiencePicker
                  value={target}
                  onChange={setTarget}
                  disabled={busy || uncertain || checking}
                />
              ) : null}
              <p>변경 후: {CATEGORY_AUDIENCE_LABELS[desired]}</p>
              <p>
                기존 공유 사본 {confirmed === null ? 0 : (confirmed.postCount ?? '확인 불가')}개에도
                변경한 범위가 적용돼요.
              </p>
            </>
          )}
          {desired === 'friends' ? (
            <p className="text-sm text-muted">현재 친구와 앞으로 추가할 친구가 볼 수 있어요.</p>
          ) : null}
          {desired === 'public' ? (
            <p className="text-sm text-muted">
              로그인하지 않은 사람도 볼 수 있어요. 이미 저장하거나 캡처한 내용은 회수할 수 없어요.
            </p>
          ) : null}
          {kind === 'metadata' ? (
            <p className="text-sm text-muted">
              이름, 색상, 이모지가 기존 공유 기록에서도 변경돼요.
            </p>
          ) : null}
          {kind === 'remove' ? (
            <p className="text-sm text-muted">
              먼저 다른 사람에게 보이는 카테고리를 철회해요. 공유 사본은 내 공유에서 따로 삭제할 수
              있어요. 개인 삭제를 되돌려도 공개되지는 않아요.
            </p>
          ) : null}
          {busy ? (
            <p role="status">
              공개 범위를 변경하는 중이에요. 서버 확인이 끝나면 새 범위를 알려드려요.
            </p>
          ) : null}
          {!checking && !hasProfile ? (
            <>
              <p>공개 범위를 설정하려면 먼저 친구 화면에서 이름을 정해 주세요.</p>
              <Button variant="outline" onClick={() => leave(onStartSocial)}>
                친구 화면에서 시작하기
              </Button>
            </>
          ) : null}
          {mode !== null && mode !== 'enabled' ? (
            <p className="text-sm text-muted">
              지금은 공유 기능을 사용할 수 없어요. 내 공유 기록은 확인하고 삭제할 수 있어요.
            </p>
          ) : null}
          {error === null ? null : (
            <div role="alert">
              <p>{error}</p>
              <Button size="sm" variant="outline" disabled={busy} onClick={onRefresh}>
                현재 범위 다시 확인
              </Button>
            </div>
          )}
          {unbound ? (
            <p className="text-sm text-muted">
              공유 연결 없음. 이 기기의 연결 정보가 없습니다. 이전 공유 상태는 공유 카테고리
              관리에서 확인하세요.
            </p>
          ) : null}
          {onManageCategories === undefined ? null : (
            <Button variant="outline" disabled={busy} onClick={() => leave(onManageCategories)}>
              공유 카테고리 관리
            </Button>
          )}
        </div>
      </Dialog>
      {leaveAction === null ? null : (
        <CategoryPublicationLeaveDialog
          onStay={() => setLeaveAction(null)}
          onLeave={() => {
            const action = leaveAction;
            setLeaveAction(null);
            action();
          }}
        />
      )}
    </>
  );
}

export function CategoryPublicationLeaveDialog({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  const stayRef = useRef<HTMLButtonElement>(null);
  return (
    <Dialog
      open
      role="alertdialog"
      title="완료 여부를 나중에 확인할까요?"
      onClose={onStay}
      initialFocusRef={stayRef}
      footer={
        <>
          <Button ref={stayRef} variant="outline" onClick={onStay}>
            같은 요청으로 확인
          </Button>
          <Button onClick={onLeave}>나중에 확인</Button>
        </>
      }
    >
      <p>
        공개 범위 변경이나 철회가 적용됐을 수 있어요. 창을 닫아도 요청이 취소되지 않아요. 같은
        계정에서 다시 열어 같은 요청으로 확인할 수 있어요.
      </p>
    </Dialog>
  );
}

export function CategoryPublicationPreview({ prepared }: { prepared: PreparedPublication }) {
  return (
    <>
      <p className="font-semibold">
        서버 카테고리: {prepared.canonical.emoji} {prepared.canonical.name}
      </p>
      <p>마지막 확인 범위: {CATEGORY_AUDIENCE_LABELS[prepared.canonical.visibility]}</p>
      <p>기존 공유 사본: {prepared.canonical.postCount ?? '확인 불가'}개</p>
      {prepared.kind === 'attach' ? (
        <>
          <p className="font-semibold">이 기기 카테고리: {prepared.origin?.name}</p>
          <p>
            이 기기 카테고리를 이 공유 카테고리에 연결합니다. 기존 공유 기록의 공개범위는 현재 서버
            설정을 유지하며, 개인 할 일은 자동으로 공유되지 않습니다.
          </p>
          {prepared.canonical.visibility === 'public' ? (
            <p className="text-sm text-muted">
              로그인하지 않은 사람도 볼 수 있어요. 이미 저장하거나 캡처한 내용은 회수할 수 없어요.
            </p>
          ) : null}
        </>
      ) : (
        <p>
          다른 기기에서 연결한 경우에도 이 카테고리의 공유 기록 접근이 철회됩니다. 개인 할 일은
          삭제되지 않습니다.
        </p>
      )}
    </>
  );
}
