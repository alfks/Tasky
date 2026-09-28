'use client';

import { useEffect, useRef, useState } from 'react';

import { useMyReactions } from '@/features/social/hooks/useMyReactions';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type SocialMyReactionsPanelProps = { enabled: boolean; refreshNonce: number };

/** 오직 본인이 누른 응원 시각과 취소 행동만 보여 준다. 글 본문/작성자 조회는 하지 않는다. */
export function SocialMyReactionsPanel({ enabled, refreshNonce }: SocialMyReactionsPanelProps) {
  const reactions = useMyReactions(enabled);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { refresh } = reactions;

  useEffect(() => {
    if (enabled && refreshNonce > 0) void refresh();
  }, [enabled, refreshNonce, refresh]);

  const focusHeading = () => {
    requestAnimationFrame(() => {
      const heading = headingRef.current;
      if (heading?.isConnected && !heading.closest('[hidden]'))
        heading.focus({ preventScroll: true });
    });
  };
  const changePage = async (direction: 'next' | 'previous') => {
    const done = direction === 'next' ? await reactions.next() : await reactions.previous();
    if (done) focusHeading();
  };
  const confirmCancel = async () => {
    if (cancelId === null) return;
    const done = await reactions.cancel(cancelId);
    if (done) {
      setCancelId(null);
      focusHeading();
    }
  };

  return (
    <section
      aria-labelledby="social-my-reactions-title"
      className="flex flex-col gap-[var(--space-2)]"
    >
      <h2
        id="social-my-reactions-title"
        ref={headingRef}
        tabIndex={-1}
        className="font-semibold outline-none"
      >
        보낸 응원
      </h2>
      <p className="text-sm text-muted">
        본인이 누른 응원 시각만 보여 줘요. 친구의 글 내용은 이 목록에 표시하지 않아요.
      </p>
      <Button variant="outline" disabled={reactions.busy} onClick={() => void reactions.refresh()}>
        응원 목록 새로고침
      </Button>
      {reactions.phase === 'loading' || reactions.phase === 'idle' ? (
        <p role="status">보낸 응원을 확인하는 중이에요.</p>
      ) : null}
      {reactions.error ? <p role="alert">{reactions.error}</p> : null}
      {reactions.phase === 'error' ? (
        <Button variant="outline" onClick={() => void reactions.retry()}>
          다시 시도
        </Button>
      ) : null}
      {reactions.phase === 'ready' && reactions.items.length === 0 ? (
        <p>
          {reactions.pageIndex > 0
            ? '이 페이지에 취소할 응원이 없어요. 이전 기록으로 돌아갈 수 있어요.'
            : '아직 보낸 응원이 없어요.'}
        </p>
      ) : null}
      {reactions.phase === 'ready'
        ? reactions.items.map((item, index) => (
            <div
              key={item.postId}
              className="flex flex-wrap items-center justify-between gap-[var(--space-2)] border-b border-border py-[var(--space-2)]"
            >
              <span>
                응원 기록 {reactions.pageIndex * 20 + index + 1} ·{' '}
                {new Date(item.createdAt).toLocaleString('ko-KR')}
              </span>
              <Button
                variant="outline"
                disabled={reactions.busy}
                onClick={() => setCancelId(item.postId)}
              >
                응원 취소
              </Button>
            </div>
          ))
        : null}
      {reactions.phase === 'ready' ? (
        <div className="flex justify-between gap-[var(--space-2)]">
          <Button
            variant="outline"
            disabled={reactions.pageIndex === 0 || reactions.busy}
            onClick={() => void changePage('previous')}
          >
            이전 응원
          </Button>
          <Button
            variant="outline"
            disabled={reactions.nextCursor === null || reactions.busy}
            onClick={() => void changePage('next')}
          >
            다음 응원
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={cancelId !== null}
        title="이 응원을 취소할까요?"
        description="이 목록에는 친구 글의 내용이 표시되지 않아요. 선택한 시각의 응원만 취소해요."
        confirmLabel="응원 취소"
        onConfirm={() => void confirmCancel()}
        onCancel={() => setCancelId(null)}
        returnFocus={() => headingRef.current}
      />
    </section>
  );
}
