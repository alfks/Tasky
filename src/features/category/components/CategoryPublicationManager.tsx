import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import type { CategoryId } from '@/domain/ids';

import {
  CategoryPublicationLeaveDialog,
  CategoryPublicationPreview,
} from '@/features/category/components/CategoryAudienceDialog';
import { CATEGORY_AUDIENCE_LABELS } from '@/features/category/components/CategoryAudiencePicker';
import {
  createCategoryPublicationManager,
  type PublicationManagerDependencies,
} from '@/features/category/store/category-publication-manager';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

export { publicationRecovery as categoryPublicationRecovery } from '@/features/category/store/category-publication-recovery';

type CategoryPublicationManagerProps = {
  dependencies: PublicationManagerDependencies;
  onClose: () => void;
  onConfirmed?: (kind: 'attach' | 'revoke') => void;
};

/** 서버 소유자 확인과 명령 수명은 제어기가 맡고 이 화면은 명시 선택과 동의만 받는다. */
export function CategoryPublicationManager({
  dependencies,
  onClose,
  onConfirmed,
}: CategoryPublicationManagerProps) {
  const [{ manager, subscribeInvalidation }] = useState(() => ({
    manager: createCategoryPublicationManager(dependencies),
    subscribeInvalidation: dependencies.subscribeInvalidation,
  }));
  const snapshot = useSyncExternalStore(
    manager.subscribe,
    manager.getSnapshot,
    manager.getSnapshot,
  );
  const [selectedRemote, setSelectedRemote] = useState<string | null>(null);
  const [selectedLocal, setSelectedLocal] = useState<CategoryId | ''>('');
  const [leaving, setLeaving] = useState(false);
  const [notice, setNotice] = useState('');
  const cancelRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLParagraphElement>(null);
  const prepared = snapshot.prepared;
  const busy = snapshot.phase === 'saving';
  const checking = snapshot.phase === 'checking';
  const receiptBlocked =
    snapshot.error === 'request-expired' || snapshot.error === 'idempotency-conflict';
  const locals = dependencies.listLocal().filter((category) => category.deletedAt === undefined);
  const eligible = locals.filter(
    (category) => category.socialCategoryId === undefined && !manager.hasPending(category.id),
  );
  useEffect(() => {
    manager.resume();
    const stop = subscribeInvalidation?.(manager.invalidate);
    void manager.refresh();
    return () => {
      stop?.();
      manager.dispose();
    };
  }, [manager, subscribeInvalidation]);
  useEffect(() => {
    if (prepared !== null) cancelRef.current?.focus();
  }, [prepared]);
  const close = () => {
    if (busy) return;
    if (snapshot.uncertain) setLeaving(true);
    else onClose();
  };
  const confirm = async () => {
    if (prepared === null) return;
    const saved = snapshot.uncertain
      ? await manager.retryPending()
      : prepared.kind === 'attach'
        ? await manager.confirmAttach(prepared)
        : await manager.confirmRevoke(prepared);
    if (!saved) return;
    setSelectedRemote(null);
    setSelectedLocal('');
    setNotice(
      prepared.kind === 'attach'
        ? '이 기기의 연결 표식을 저장했어요. 개인 이름과 할 일은 그대로예요.'
        : '공유 카테고리를 철회했어요. 개인 할 일은 그대로예요.',
    );
    onConfirmed?.(prepared.kind);
    await manager.refresh();
    headingRef.current?.focus();
  };
  const error = receiptBlocked
    ? '같은 요청을 더 이상 확인할 수 없어요. 나중에 확인으로 돌아가 서버의 공유 카테고리 목록에서 현재 상태를 확인해 주세요.'
    : snapshot.error === 'conflict'
      ? '상태가 변경되었습니다. 최신 범위를 확인하고 다시 선택해 주세요.'
      : snapshot.error === 'unauthorized' || snapshot.error === 'account-deleted'
        ? '로그인을 다시 확인해야 해요. 다른 계정의 내용은 보여 주지 않아요.'
        : snapshot.error === null
          ? null
          : snapshot.uncertain
            ? '완료 여부를 확인하지 못했어요. 같은 요청으로 다시 확인해 주세요.'
            : '목록을 확인하거나 연결하지 못했어요. 인터넷 연결을 확인하고 다시 시도해 주세요.';
  return (
    <>
      <Dialog
        open
        title={
          prepared?.kind === 'attach'
            ? '공유 카테고리 연결 확인'
            : prepared?.kind === 'revoke'
              ? '이 공유 카테고리를 철회할까요?'
              : '공유 카테고리 관리'
        }
        onClose={close}
        initialFocusRef={headingRef}
        footer={
          <>
            <Button
              ref={cancelRef}
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (snapshot.uncertain) close();
                else if (prepared !== null || selectedRemote !== null) {
                  manager.clearPrepared();
                  setSelectedRemote(null);
                  setSelectedLocal('');
                } else onClose();
              }}
            >
              {snapshot.uncertain
                ? '나중에 확인'
                : prepared === null && selectedRemote === null
                  ? '닫기'
                  : '취소'}
            </Button>
            {prepared === null ? null : (
              <Button
                variant={prepared.kind === 'revoke' ? 'danger' : 'primary'}
                loading={busy}
                disabled={
                  checking ||
                  receiptBlocked ||
                  (prepared.kind === 'attach' && snapshot.mode !== 'enabled')
                }
                onClick={() => void confirm()}
              >
                {snapshot.uncertain
                  ? '같은 요청 다시 확인'
                  : prepared.kind === 'attach'
                    ? '연결하기'
                    : '공유 철회'}
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-col gap-[var(--space-4)]">
          <p ref={headingRef} tabIndex={-1} className="text-sm text-muted outline-none">
            이 계정에서 공유한 카테고리입니다. 이 기기에 연결되지 않은 항목은 다른 기기에서 만든
            것일 수 있어요.
          </p>
          {snapshot.mode !== null && snapshot.mode !== 'enabled' ? (
            <p className="text-sm text-muted">
              지금은 새 연결을 만들 수 없어요. 기존 공유 상태 확인과 공개 철회는 할 수 있어요.
            </p>
          ) : null}
          {error === null ? null : <p role="alert">{error}</p>}
          {notice === '' ? null : (
            <p role="status" aria-live="polite">
              {notice}
            </p>
          )}
          {checking ? <p role="status">공유 카테고리를 확인하는 중</p> : null}
          {prepared !== null ? (
            <CategoryPublicationPreview prepared={prepared} />
          ) : selectedRemote !== null ? (
            <>
              <label className="flex flex-col gap-[var(--space-2)]">
                연결할 이 기기 카테고리
                <select
                  value={selectedLocal}
                  disabled={checking}
                  onChange={(event) => setSelectedLocal(event.target.value)}
                  className="min-h-[var(--control-height)] w-full rounded-[var(--radius-md)] border border-border bg-surface px-[var(--space-3)] text-text focus-visible:outline-2 focus-visible:outline-focus"
                >
                  <option value="">카테고리를 직접 선택해 주세요</option>
                  {eligible.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              {eligible.length === 0 ? (
                <p>
                  연결할 수 있는 카테고리가 없습니다. 확인 필요인 항목은 같은 요청으로 먼저 확인해
                  주세요.
                </p>
              ) : null}
              <Button
                disabled={selectedLocal === '' || checking}
                onClick={() => {
                  if (selectedLocal !== '')
                    void manager.prepareAttach(selectedRemote, selectedLocal);
                }}
              >
                연결 내용 확인
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" disabled={checking} onClick={() => void manager.refresh()}>
                목록 다시 불러오기
              </Button>
              {snapshot.items.length === 0 && !checking ? (
                <p>
                  {snapshot.nextCursor === null
                    ? '아직 공유한 카테고리가 없어요.'
                    : '이 페이지에 표시할 카테고리가 없어요.'}
                </p>
              ) : null}
              <ul className="flex flex-col gap-[var(--space-3)]">
                {snapshot.items.map((category) => {
                  const linked = locals.some((local) => local.socialCategoryId === category.id);
                  return (
                    <li
                      key={category.id}
                      className="rounded-[var(--radius-md)] border border-border p-[var(--space-3)]"
                    >
                      <h3 className="flex items-center gap-[var(--space-2)] font-semibold break-words">
                        <span
                          aria-hidden
                          style={{ backgroundColor: category.color }}
                          className="size-[12px] shrink-0 rounded-full"
                        />
                        {category.emoji} {category.name}
                      </h3>
                      <p>
                        {category.revoked
                          ? '철회됨'
                          : CATEGORY_AUDIENCE_LABELS[category.visibility]}{' '}
                        · 공유 사본 {category.postCount ?? '확인 불가'}개
                      </p>
                      <p className="text-sm text-muted">
                        {linked
                          ? '이 기기에 연결됨'
                          : '이 기기에 연결되지 않음 — 다른 기기에서 만든 항목일 수 있어요.'}
                      </p>
                      {manager.hasPendingRemote(category.id) ? (
                        <p>확인 필요: 철회가 적용됐을 수 있어요.</p>
                      ) : null}
                      {category.revoked && !manager.hasPendingRemote(category.id) ? null : (
                        <div className="mt-[var(--space-2)] flex flex-wrap gap-[var(--space-2)]">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={
                              category.revoked || linked || checking || snapshot.mode !== 'enabled'
                            }
                            onClick={() => {
                              setSelectedRemote(category.id);
                              setSelectedLocal('');
                            }}
                          >
                            연결하기
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={checking}
                            onClick={() => void manager.prepareRevoke(category.id)}
                          >
                            {manager.hasPendingRemote(category.id) ? '완료 여부 확인' : '공유 철회'}
                          </Button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <Button
                variant="outline"
                disabled={checking || snapshot.nextCursor === null}
                onClick={() => void manager.next()}
              >
                다음 카테고리 보기
              </Button>
            </>
          )}
        </div>
      </Dialog>
      {leaving ? (
        <CategoryPublicationLeaveDialog onStay={() => setLeaving(false)} onLeave={onClose} />
      ) : null}
    </>
  );
}
