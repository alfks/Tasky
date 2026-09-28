'use client';

import { useRef } from 'react';

import { SocialFeedCard } from '@/features/social/components/SocialFeedCard';
import { useBlockFromFeed } from '@/features/social/hooks/useBlockFromFeed';
import { useSocialReaction } from '@/features/social/hooks/useSocialReaction';
import { useSocialStore, useVisibleSocialPosts } from '@/features/social/store/social-store';

import { Button } from '@/components/ui/Button';

type SocialFeedPanelProps = {
  onOpenFriends: () => void;
  onOpenMine: () => void;
};

export function SocialFeedPanel({ onOpenFriends, onOpenMine }: SocialFeedPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const navigationRef = useRef(0);
  const phase = useSocialStore((state) => state.phase);
  const mode = useSocialStore((state) => state.mode);
  const profile = useSocialStore((state) => state.profile);
  const canShow = useSocialStore((state) => state.canShow);
  const pageIndex = useSocialStore((state) => state.pageIndex);
  const nextCursor = useSocialStore((state) => state.nextCursor);
  const hasNew = useSocialStore((state) => state.hasNew);
  const error = useSocialStore((state) => state.error);
  const cursorExpired = useSocialStore((state) => state.cursorExpired);
  const refresh = useSocialStore((state) => state.refresh);
  const refreshCurrent = useSocialStore((state) => state.refreshCurrent);
  const next = useSocialStore((state) => state.next);
  const previous = useSocialStore((state) => state.previous);
  const posts = useVisibleSocialPosts();
  const reaction = useSocialReaction();
  const block = useBlockFromFeed();

  const focusHeading = () => {
    const heading = headingRef.current;
    if (heading?.isConnected && !heading.closest('[hidden]'))
      heading.focus({ preventScroll: true });
  };
  const changePage = async (direction: 'next' | 'previous') => {
    const navigation = ++navigationRef.current;
    if (direction === 'next') await next();
    else await previous();
    if (navigation === navigationRef.current && useSocialStore.getState().phase === 'ready')
      focusHeading();
  };
  const showNew = async () => {
    const navigation = ++navigationRef.current;
    await refresh();
    if (navigation === navigationRef.current && useSocialStore.getState().phase === 'ready')
      focusHeading();
  };

  return (
    <div className="flex flex-col gap-[var(--space-3)]">
      <h2
        id="social-feed-title"
        ref={headingRef}
        tabIndex={-1}
        className="font-semibold outline-none"
      >
        친구 피드
      </h2>
      {mode === 'off' ? (
        <p role="status">
          지금은 피드를 볼 수 없어요. 친구 관리와 내 공유 삭제는 사용할 수 있어요.
        </p>
      ) : null}
      {phase === 'blocked' ? (
        <p role="status">친구 화면은 인터넷 연결과 로그인이 필요해요.</p>
      ) : null}
      {phase === 'loading' ? <p role="status">불러오는 중</p> : null}
      {phase === 'error' ? (
        <div role="alert">
          <p>
            {error === 'rate-limited'
              ? '요청이 많아요. 잠시 후 다시 시도해 주세요.'
              : cursorExpired
                ? '기록 위치가 만료됐어요. 처음부터 새로 확인해 주세요.'
                : '불러오지 못했어요.'}
          </p>
          <Button onClick={() => void (cursorExpired ? refresh() : refreshCurrent())}>
            {cursorExpired ? '처음부터 새로 보기' : '다시 시도'}
          </Button>
        </div>
      ) : null}
      {phase === 'ready' && mode !== 'off' && canShow && posts.length === 0 && pageIndex > 0 ? (
        <div className="flex flex-col items-start gap-[var(--space-2)]">
          <p>이 페이지에 표시할 기록이 없어요.</p>
          <Button variant="outline" onClick={() => void showNew()}>
            처음부터 다시 보기
          </Button>
        </div>
      ) : null}
      {phase === 'ready' && mode !== 'off' && canShow && posts.length === 0 && pageIndex === 0 ? (
        <div className="flex flex-col items-start gap-[var(--space-2)]">
          <p>아직 공유한 기록이 없어요.</p>
          <Button variant="outline" onClick={onOpenFriends}>
            친구 초대
          </Button>
          <Button variant="ghost" onClick={onOpenMine}>
            기록 공유
          </Button>
        </div>
      ) : null}
      {phase === 'ready' && canShow
        ? posts.map((post) => (
            <SocialFeedCard
              key={post.id}
              post={post}
              mode={mode}
              ownProfileId={profile?.id ?? null}
              busy={reaction.busyId !== null || block.busy}
              onReact={reaction.setReaction}
              onBlock={async (peerId) => {
                const done = await block.block(peerId);
                if (done) focusHeading();
                return done;
              }}
            />
          ))
        : null}
      {reaction.error ? (
        <p role="alert" className="text-danger">
          {reaction.error}
        </p>
      ) : null}
      {block.error ? (
        <p role="alert" className="text-danger">
          {block.error}
        </p>
      ) : null}
      {hasNew && canShow ? (
        <Button variant="outline" onClick={() => void showNew()}>
          새 기록 보기
        </Button>
      ) : null}
      {phase === 'ready' && mode !== 'off' ? (
        <div className="flex justify-between gap-[var(--space-2)]">
          <Button
            variant="outline"
            disabled={pageIndex === 0}
            onClick={() => void changePage('previous')}
          >
            이전 기록
          </Button>
          <Button
            variant="outline"
            disabled={nextCursor === null}
            onClick={() => void changePage('next')}
          >
            다음 기록
          </Button>
        </div>
      ) : null}
    </div>
  );
}
