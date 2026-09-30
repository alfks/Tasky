import { useRef } from 'react';

import { SocialPagination } from '@/features/social/components/SocialPagination';
import { SocialPostCard } from '@/features/social/components/SocialPostCard';
import { socialFailureMessage } from '@/features/social/hooks/useSocialCommand';
import { useSocialStore, useVisibleSocialPosts } from '@/features/social/store/social-store';

import { Button } from '@/components/ui/Button';

type SocialFeedProps = { mine: boolean; onShare: () => void; onFriends: () => void };
export function SocialFeed({ mine, onShare, onFriends }: SocialFeedProps) {
  const posts = useVisibleSocialPosts();
  const phase = useSocialStore((state) => state.phase);
  const mode = useSocialStore((state) => state.mode);
  const profile = useSocialStore((state) => state.profile);
  const view = useSocialStore((state) => state.view);
  const error = useSocialStore((state) => state.error);
  const hasNew = useSocialStore((state) => state.hasNew);
  const pageIndex = useSocialStore((state) => state.pageIndex);
  const nextCursor = useSocialStore((state) => state.nextCursor);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const move = async (operation: 'next' | 'previous' | 'refresh') => {
    await useSocialStore.getState()[operation]();
    headingRef.current?.focus();
    headingRef.current?.scrollIntoView({ block: 'start' });
  };
  return (
    <section aria-labelledby="social-feed-heading" className="flex flex-col gap-[var(--space-4)]">
      <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)]">
        <h2
          id="social-feed-heading"
          ref={headingRef}
          tabIndex={-1}
          className="text-lg font-semibold outline-none"
        >
          {mine ? '내 공유' : '피드'}
        </h2>
        <Button disabled={mode !== 'enabled'} onClick={onShare}>
          기록 공유
        </Button>
      </div>
      {mine ? null : (
        <div role="group" aria-label="피드 공개 범위" className="flex gap-[var(--space-2)]">
          <Button
            variant="outline"
            aria-pressed={view === 'friends'}
            onClick={() => void useSocialStore.getState().setView('friends')}
          >
            친구
          </Button>
          <Button
            variant="outline"
            aria-pressed={view === 'public'}
            onClick={() => void useSocialStore.getState().setView('public')}
          >
            모두 공개
          </Button>
        </div>
      )}
      {hasNew ? (
        <Button variant="outline" onClick={() => void move('refresh')}>
          새 기록 보기
        </Button>
      ) : null}
      {phase === 'loading' ? (
        <p role="status" aria-label="불러오는 중">
          기록을 불러오는 중
        </p>
      ) : null}
      {phase === 'blocked' ? (
        <p role="status">친구 화면은 인터넷 연결이 필요해요. 연결과 로그인을 확인해 주세요.</p>
      ) : null}
      {error === null ? null : (
        <p role="alert">
          {socialFailureMessage(error)}
          <Button variant="outline" onClick={() => void move('refresh')}>
            다시 시도
          </Button>
        </p>
      )}
      {phase === 'ready' && posts.length === 0 ? (
        <div className="flex flex-col items-start gap-[var(--space-2)]">
          <p className="text-muted">
            {nextCursor !== null
              ? '이 페이지에 표시할 기록이 없어요.'
              : mine
                ? '아직 공유한 기록이 없어요'
                : view === 'public'
                  ? '아직 모두 공개로 공유한 기록이 없어요.'
                  : '친구를 초대해 완료한 일을 나눠 보세요'}
          </p>
          {mine || view === 'public' || nextCursor !== null ? null : (
            <Button variant="outline" onClick={onFriends}>
              친구 초대
            </Button>
          )}
        </div>
      ) : null}
      <div className="flex min-w-0 flex-col gap-[var(--space-3)]">
        {posts.map((post) => (
          <SocialPostCard
            key={post.id}
            post={post}
            own={post.author.id === profile?.id}
            canWrite={mode === 'enabled'}
            onChanged={() => void move('refresh')}
            returnFocus={() => headingRef.current}
          />
        ))}
      </div>
      <SocialPagination
        pageIndex={pageIndex}
        nextCursor={nextCursor}
        busy={phase === 'loading'}
        onNext={() => void move('next')}
        onPrevious={() => void move('previous')}
      />
    </section>
  );
}
