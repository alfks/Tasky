'use client';

import { useEffect, useRef, useState } from 'react';

import { useMyReactions } from '@/features/social/hooks/useMyReactions';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

type SocialMyReactionsPanelProps = { enabled: boolean; refreshNonce: number };

/** 오직 본인이 누른 응원 시각과 취소 행동만 보여 준다. 글 본문/작성자 조회는 하지 않는다. */
export function SocialMyReactionsPanel({ enabled, refreshNonce }: SocialMyReactionsPanelProps) {
  const reactions = useMyReactions(enabled);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const { refresh } = reactions;
  const selected = reactions.items.find((item) => item.postId === cancelId);

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
      <Button
        variant="outline"
        disabled={reactions.busy || reactions.cooldownSeconds > 0}
        onClick={() => void reactions.refresh()}
      >
        응원 목록 새로고침
      </Button>
      {reactions.cooldownSeconds > 0 ? (
        <p role="status">{reactions.cooldownSeconds}초 뒤 다시 시도할 수 있어요.</p>
      ) : null}
      {reactions.phase === 'loading' || reactions.phase === 'idle' ? (
        <p role="status">보낸 응원을 확인하는 중이에요.</p>
      ) : null}
      {reactions.error && cancelId === null ? <p role="alert">{reactions.error}</p> : null}
      {reactions.phase === 'error' ? (
        <Button
          variant="outline"
          disabled={reactions.cooldownSeconds > 0}
          onClick={() => void reactions.retry()}
        >
          {reactions.cursorExpired ? '처음부터 다시 보기' : '다시 시도'}
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
                disabled={reactions.busy || reactions.cooldownSeconds > 0}
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
            disabled={reactions.pageIndex === 0 || reactions.busy || reactions.cooldownSeconds > 0}
            onClick={() => void changePage('previous')}
          >
            이전 응원
          </Button>
          <Button
            variant="outline"
            disabled={
              reactions.nextCursor === null || reactions.busy || reactions.cooldownSeconds > 0
            }
            onClick={() => void changePage('next')}
          >
            다음 응원
          </Button>
        </div>
      ) : null}
      <Dialog
        open={cancelId !== null}
        onClose={() => setCancelId(null)}
        role="alertdialog"
        title="이 응원을 취소할까요?"
        description={
          <>
            <p>
              이 목록에는 친구 글의 내용이 표시되지 않아요.{' '}
              {selected
                ? `${new Date(selected.createdAt).toLocaleString('ko-KR')}에 보낸 응원만 취소해요.`
                : '선택한 응원 기록만 취소해요.'}
            </p>
            {reactions.error ? <p role="alert">{reactions.error}</p> : null}
            {reactions.cooldownSeconds > 0 ? (
              <p role="status">{reactions.cooldownSeconds}초 뒤 다시 시도할 수 있어요.</p>
            ) : null}
          </>
        }
        initialFocusRef={cancelRef}
        returnFocus={() => headingRef.current}
        className="max-w-[400px]"
        footer={
          <>
            <Button ref={cancelRef} variant="outline" onClick={() => setCancelId(null)}>
              취소
            </Button>
            {reactions.phase === 'error' ? (
              <Button
                variant="outline"
                disabled={reactions.cooldownSeconds > 0}
                onClick={() => void reactions.retry()}
              >
                {reactions.cursorExpired ? '처음부터 다시 보기' : '목록 다시 확인'}
              </Button>
            ) : null}
            <Button
              variant="danger"
              disabled={
                reactions.phase !== 'ready' ||
                reactions.busy ||
                reactions.cooldownSeconds > 0 ||
                !reactions.items.some((item) => item.postId === cancelId)
              }
              onClick={() => void confirmCancel()}
            >
              {reactions.error ? '같은 요청으로 재시도' : '응원 취소'}
            </Button>
          </>
        }
      />
    </section>
  );
}
