'use client';

import { useEffect, useRef, useState } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { SocialShareComposer } from '@/features/social/components/SocialShareComposer';
import { useMyPosts } from '@/features/social/hooks/useMyPosts';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

type SocialMyPostsPanelProps = {
  initialDate: DateKey;
  refreshNonce: number;
  onDirtyChange: (dirty: boolean) => void;
  enabled: boolean;
};

export function SocialMyPostsPanel({
  initialDate,
  refreshNonce,
  onDirtyChange,
  enabled,
}: SocialMyPostsPanelProps) {
  const posts = useMyPosts(enabled);
  const { refresh } = posts;
  const [composerOpen, setComposerOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [moreId, setMoreId] = useState<string | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const firstPostRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (enabled && refreshNonce > 0) void refresh();
  }, [enabled, refreshNonce, refresh]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const publish = async (input: { text: string; happenedOn: string }): Promise<boolean> => {
    const done = await posts.create(input);
    if (done) requestAnimationFrame(() => firstPostRef.current?.focus({ preventScroll: true }));
    return done;
  };
  const deletePost = async () => {
    if (deleteId === null) return;
    const done = await posts.remove(deleteId);
    if (done) setDeleteId(null);
  };
  const changePage = async (direction: 'next' | 'previous') => {
    if (direction === 'next') await posts.next();
    else await posts.previous();
    headingRef.current?.focus({ preventScroll: true });
  };

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)]">
        <h2 ref={headingRef} tabIndex={-1} className="font-semibold outline-none">
          내 공유 기록
        </h2>
        <Button disabled={posts.mode !== 'enabled'} onClick={() => setComposerOpen(true)}>
          기록 공유
        </Button>
      </div>
      {posts.phase === 'ready' && posts.mode !== 'enabled' ? (
        <p className="text-sm text-muted">
          지금은 새 공유를 만들 수 없어요. 기존 공유 조회와 삭제는 사용할 수 있어요.
        </p>
      ) : null}
      {posts.message ? (
        <p role={posts.phase === 'error' ? 'alert' : 'status'} className="text-sm">
          {posts.message}
        </p>
      ) : null}
      {posts.phase === 'loading' || posts.phase === 'idle' ? (
        <p role="status">내 공유를 불러오는 중이에요.</p>
      ) : null}
      {posts.phase === 'error' ? (
        <Button onClick={() => void posts.refresh()}>다시 시도</Button>
      ) : null}
      {posts.phase === 'ready' && posts.items.length === 0 ? (
        <p>
          {posts.pageIndex > 0
            ? '이 페이지에 표시할 기록이 없어요. 이전 기록으로 돌아갈 수 있어요.'
            : '아직 공유한 기록이 없어요.'}
        </p>
      ) : null}
      {posts.phase === 'ready'
        ? posts.items.map((post, index) => (
            <article
              key={post.id}
              ref={index === 0 ? firstPostRef : undefined}
              tabIndex={-1}
              className="rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-4)] outline-none"
            >
              <div className="flex flex-wrap justify-between gap-[var(--space-2)]">
                <h3 className="font-semibold">{post.author.nickname}</h3>
                <time dateTime={post.happenedOn}>{post.happenedOn}</time>
              </div>
              <p className="mt-[var(--space-3)] break-words whitespace-pre-wrap">{post.text}</p>
              <Button
                variant="ghost"
                onClick={() => setMoreId((current) => (current === post.id ? null : post.id))}
                aria-expanded={moreId === post.id}
              >
                더 보기
              </Button>
              {moreId === post.id ? (
                <Button
                  variant="outline"
                  disabled={posts.busy}
                  onClick={() => setDeleteId(post.id)}
                >
                  공유 삭제
                </Button>
              ) : null}
            </article>
          ))
        : null}
      {posts.phase === 'ready' ? (
        <div className="flex justify-between gap-[var(--space-2)]">
          <Button
            variant="outline"
            disabled={posts.pageIndex === 0}
            onClick={() => void changePage('previous')}
          >
            이전 기록
          </Button>
          <Button
            variant="outline"
            disabled={posts.nextCursor === null}
            onClick={() => void changePage('next')}
          >
            다음 기록
          </Button>
        </div>
      ) : null}
      {composerOpen ? (
        <SocialShareComposer
          visible={enabled}
          initialDate={initialDate}
          hasFriends={posts.hasFriends}
          busy={posts.busy}
          onPublish={publish}
          onDone={() => setComposerOpen(false)}
          onDirtyChange={onDirtyChange}
        />
      ) : null}
      <ConfirmDialog
        open={deleteId !== null}
        title="이 공유를 삭제할까요?"
        description="친구 화면에서 사라지고 응원도 함께 지워져요. 원래 할 일은 그대로 남아요."
        confirmLabel="공유 삭제"
        onConfirm={() => void deletePost()}
        onCancel={() => setDeleteId(null)}
        returnFocus={() => headingRef.current}
      />
    </div>
  );
}
