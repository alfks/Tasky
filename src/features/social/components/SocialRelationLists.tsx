'use client';

import { useState } from 'react';

import type { FriendView, RequestView } from '@/domain/social/social';

import type { useSocialRelations } from '@/features/social/hooks/useSocialRelations';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type SocialRelationListsProps = {
  relations: ReturnType<typeof useSocialRelations>;
  onGoFeed: () => void;
};
type PendingConfirm = { kind: 'remove'; item: FriendView } | { kind: 'block'; item: FriendView };

function restoreSection(id: string, valid: () => boolean): void {
  requestAnimationFrame(() => {
    if (!valid()) return;
    const tab = document.getElementById('social-tab-friends');
    if (tab?.getAttribute('aria-selected') !== 'true') return;
    const target = document.getElementById(id) ?? tab;
    if (!target.closest('[hidden]')) target.focus({ preventScroll: true });
  });
}

export function SocialRelationLists({ relations, onGoFeed }: SocialRelationListsProps) {
  const { data, busy } = relations;
  const [confirm, setConfirm] = useState<PendingConfirm | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const mode = data.me?.mode;
  const runAndRestore = (run: () => Promise<boolean>, id: string, message?: string) => {
    const valid = relations.captureView();
    void run().then((done) => {
      if (!done || !valid()) return;
      if (message) setNotice(message);
      restoreSection(id, valid);
    });
  };
  const resolveConfirm = async () => {
    if (confirm === null || busy) return;
    const valid = relations.captureView();
    const done =
      confirm.kind === 'remove'
        ? await relations.removeFriend(confirm.item)
        : await relations.block(confirm.item.id, true, confirm.item.pairVersion);
    if (done && valid()) {
      setConfirm(null);
      setNotice(confirm.kind === 'remove' ? '친구를 해제했어요.' : '사용자를 차단했어요.');
      restoreSection('social-friends-title', valid);
    }
  };

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {notice ? <p role="status">{notice}</p> : null}
      <section aria-labelledby="social-incoming-title">
        <h2 id="social-incoming-title" tabIndex={-1} className="font-semibold outline-none">
          받은 요청
        </h2>
        {data.incoming.length === 0 ? (
          <p className="text-sm text-muted">받은 요청이 없어요.</p>
        ) : (
          data.incoming.map((item: RequestView) => (
            <div
              key={item.peer.id}
              className="flex flex-wrap items-center gap-[var(--space-2)] py-[var(--space-2)]"
            >
              <span>{item.peer.nickname}</span>
              <Button
                disabled={busy || mode !== 'enabled'}
                onClick={() =>
                  runAndRestore(
                    () => relations.changeRequest('accept', item),
                    'social-incoming-title',
                  )
                }
              >
                수락
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  runAndRestore(
                    () => relations.changeRequest('decline', item),
                    'social-incoming-title',
                  )
                }
              >
                거절
              </Button>
            </div>
          ))
        )}
      </section>
      {data.next.incoming ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void relations.loadMore('incoming')}
        >
          받은 요청 더 보기
        </Button>
      ) : null}
      <section aria-labelledby="social-outgoing-title">
        <h2 id="social-outgoing-title" tabIndex={-1} className="font-semibold outline-none">
          보낸 요청
        </h2>
        {data.outgoing.length === 0 ? (
          <p className="text-sm text-muted">보낸 요청이 없어요.</p>
        ) : (
          data.outgoing.map((item: RequestView) => (
            <div
              key={item.peer.id}
              className="flex flex-wrap items-center gap-[var(--space-2)] py-[var(--space-2)]"
            >
              <span>{item.peer.nickname}</span>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  runAndRestore(
                    () => relations.changeRequest('cancel', item),
                    'social-outgoing-title',
                  )
                }
              >
                요청 취소
              </Button>
            </div>
          ))
        )}
      </section>
      {data.next.outgoing ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void relations.loadMore('outgoing')}
        >
          보낸 요청 더 보기
        </Button>
      ) : null}
      <section aria-labelledby="social-friends-title">
        <h2 id="social-friends-title" tabIndex={-1} className="font-semibold outline-none">
          친구
        </h2>
        {data.friends.length === 0 ? (
          <p>친구를 초대해 완료한 일을 나눠 보세요.</p>
        ) : (
          data.friends.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-[var(--space-2)] py-[var(--space-2)]"
            >
              <span>{item.nickname}</span>
              <Button variant="ghost" onClick={onGoFeed}>
                친구 피드로
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setConfirm({ kind: 'remove', item })}
              >
                친구 해제
              </Button>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() => setConfirm({ kind: 'block', item })}
              >
                차단
              </Button>
            </div>
          ))
        )}
      </section>
      {data.next.friends ? (
        <Button
          variant="outline"
          disabled={busy}
          onClick={() => void relations.loadMore('friends')}
        >
          친구 더 보기
        </Button>
      ) : null}
      <section aria-labelledby="social-blocks-title">
        <h2 id="social-blocks-title" tabIndex={-1} className="font-semibold outline-none">
          차단한 사용자
        </h2>
        {data.blocks.length === 0 ? (
          <p className="text-sm text-muted">차단한 사용자가 없어요.</p>
        ) : (
          data.blocks.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center gap-[var(--space-2)] py-[var(--space-2)]"
            >
              <span>{item.nickname}</span>
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  runAndRestore(
                    () => relations.block(item.id, false, item.pairVersion),
                    'social-blocks-title',
                    '차단을 해제했어요. 친구 관계는 복원되지 않아요.',
                  )
                }
              >
                차단 해제
              </Button>
            </div>
          ))
        )}
      </section>
      {data.next.blocks ? (
        <Button variant="outline" disabled={busy} onClick={() => void relations.loadMore('blocks')}>
          차단한 사용자 더 보기
        </Button>
      ) : null}
      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === 'block' ? '이 사용자를 차단할까요?' : '친구를 해제할까요?'}
        description={
          confirm?.kind === 'block'
            ? '관계와 요청이 끊기고 서로의 공유를 볼 수 없어요. 상대에게 알림은 보내지 않아요.'
            : '서로의 공유를 볼 수 없게 돼요.'
        }
        confirmLabel={confirm?.kind === 'block' ? '차단' : '친구 해제'}
        onConfirm={() => void resolveConfirm()}
        onCancel={() => setConfirm(null)}
        returnFocus={() => document.getElementById('social-friends-title')}
      />
    </div>
  );
}
