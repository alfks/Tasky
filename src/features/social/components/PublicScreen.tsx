import { useRef } from 'react';

import { SocialPagination } from '@/features/social/components/SocialPagination';
import { SocialPostCard } from '@/features/social/components/SocialPostCard';
import { usePublicFeed } from '@/features/social/hooks/usePublicFeed';
import { socialFailureMessage } from '@/features/social/hooks/useSocialCommand';

import { Button } from '@/components/ui/Button';

export function PublicScreen() {
  const feed = usePublicFeed();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const change = async (operation: 'refresh' | 'next' | 'previous') => {
    await feed[operation]();
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: 'start' });
  };
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[680px] min-w-0 flex-col gap-[var(--space-4)] bg-bg p-[var(--space-4)] text-text">
      <header className="flex flex-wrap items-center justify-between gap-[var(--space-2)]">
        <h1 ref={headingRef} tabIndex={-1} className="text-lg font-semibold outline-none">
          모두 공개 기록
        </h1>
        <a
          href="/"
          className="rounded-[var(--radius-md)] px-[var(--space-3)] py-[var(--space-2)] underline focus-visible:outline-2 focus-visible:outline-focus"
        >
          내 할 일로
        </a>
      </header>
      <p className="text-sm text-muted">
        직접 모두에게 공개한 카테고리와 공유 사본만 보여요. 원래 할 일과 메모는 공개되지 않아요.
      </p>
      <Button variant="outline" onClick={() => void change('refresh')}>
        새로고침
      </Button>
      {feed.snapshot.phase === 'loading' ? <p role="status">공개 기록을 불러오는 중</p> : null}
      {feed.snapshot.phase === 'blocked' ? (
        <p role="status">공개 기록은 인터넷 연결이 필요해요.</p>
      ) : null}
      {feed.snapshot.error === null ? null : (
        <p role="alert">{socialFailureMessage(feed.snapshot.error)}</p>
      )}
      {feed.snapshot.phase === 'ready' && feed.items.length === 0 ? (
        <p>
          {feed.snapshot.nextCursor === null
            ? '아직 모두 공개로 공유한 기록이 없어요.'
            : '이 페이지에 표시할 기록이 없어요.'}
        </p>
      ) : null}
      <div className="flex min-w-0 flex-col gap-[var(--space-3)]">
        {feed.items.map((post) => (
          <SocialPostCard
            key={post.id}
            post={post}
            own={false}
            canWrite={false}
            anonymous
            onChanged={() => void change('refresh')}
            returnFocus={() => headingRef.current}
          />
        ))}
      </div>
      <SocialPagination
        pageIndex={feed.snapshot.pageIndex}
        nextCursor={feed.snapshot.nextCursor}
        busy={feed.snapshot.phase === 'loading'}
        onNext={() => void change('next')}
        onPrevious={() => void change('previous')}
      />
    </main>
  );
}
