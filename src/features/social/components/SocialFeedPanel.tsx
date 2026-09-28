'use client';

import { useEffect, useRef, useState } from 'react';

import { SocialFeedCard } from '@/features/social/components/SocialFeedCard';
import { useBlockFromFeed } from '@/features/social/hooks/useBlockFromFeed';
import { useSocialReaction } from '@/features/social/hooks/useSocialReaction';
import { useSocialStore, useVisibleSocialPosts } from '@/features/social/store/social-store';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

type SocialFeedPanelProps = {
  onOpenFriends: () => void;
  onOpenMine: () => void;
};

export function SocialFeedPanel({ onOpenFriends, onOpenMine }: SocialFeedPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const blockCancelRef = useRef<HTMLButtonElement>(null);
  const navigationRef = useRef(0);
  const [menuPostId, setMenuPostId] = useState<string | null>(null);
  const [blockTarget, setBlockTarget] = useState<{
    postId: string;
    peerId: string;
    profileId: string;
    navigation: number;
  } | null>(null);
  const reactionFocusRef = useRef<{
    postId: string;
    index: number;
    profileId: string;
    navigation: number;
    committed: boolean;
  } | null>(null);
  const [focusVersion, setFocusVersion] = useState(0);
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
  const reaction = useSocialReaction({
    begin: (postId, index) => {
      reactionFocusRef.current = profile
        ? {
            postId,
            index,
            profileId: profile.id,
            navigation: navigationRef.current,
            committed: false,
          }
        : null;
    },
    committed: () => {
      if (reactionFocusRef.current) reactionFocusRef.current.committed = true;
      setFocusVersion((version) => version + 1);
    },
    cancel: () => {
      reactionFocusRef.current = null;
    },
  });
  const block = useBlockFromFeed();

  useEffect(() => {
    if (phase === 'blocked' || phase === 'error' || mode === 'off') {
      setMenuPostId(null);
      setBlockTarget(null);
      return;
    }
    if (phase !== 'ready' || !canShow) return;
    if (menuPostId !== null && !posts.some((post) => post.id === menuPostId)) setMenuPostId(null);
    if (
      blockTarget !== null &&
      (blockTarget.navigation !== navigationRef.current ||
        blockTarget.profileId !== profile?.id ||
        !posts.some(
          (post) => post.id === blockTarget.postId && post.author.id === blockTarget.peerId,
        ))
    )
      setBlockTarget(null);
  }, [phase, mode, canShow, menuPostId, blockTarget, posts, profile]);

  useEffect(() => {
    const intent = reactionFocusRef.current;
    if (intent === null || !intent.committed) return;
    if (
      intent.navigation !== navigationRef.current ||
      profile?.id !== intent.profileId ||
      phase === 'blocked' ||
      mode === 'off'
    ) {
      reactionFocusRef.current = null;
      return;
    }
    if (phase === 'loading') return;
    const handle = requestAnimationFrame(() => {
      if (reactionFocusRef.current !== intent || intent.navigation !== navigationRef.current)
        return;
      const snapshot = useSocialStore.getState();
      const heading = headingRef.current;
      if (!heading?.isConnected || heading.closest('[hidden]')) return;
      if (snapshot.profile?.id !== intent.profileId) return;
      if (snapshot.phase === 'ready' && snapshot.canShow) {
        const buttons = Array.from(
          document.querySelectorAll<HTMLButtonElement>('button[data-social-reaction-id]'),
        );
        const same = buttons.find((button) => button.dataset.socialReactionId === intent.postId);
        (same ?? buttons[Math.min(intent.index, buttons.length - 1)] ?? heading).focus({
          preventScroll: true,
        });
      } else if (snapshot.phase === 'error') heading.focus({ preventScroll: true });
      reactionFocusRef.current = null;
    });
    return () => cancelAnimationFrame(handle);
  }, [focusVersion, phase, canShow, profile, mode, posts]);

  const focusHeading = () => {
    const heading = headingRef.current;
    if (heading?.isConnected && !heading.closest('[hidden]'))
      heading.focus({ preventScroll: true });
  };
  const changePage = async (direction: 'next' | 'previous') => {
    const navigation = ++navigationRef.current;
    reactionFocusRef.current = null;
    setMenuPostId(null);
    setBlockTarget(null);
    if (direction === 'next') await next();
    else await previous();
    if (navigation === navigationRef.current && useSocialStore.getState().phase === 'ready')
      focusHeading();
  };
  const showNew = async () => {
    const navigation = ++navigationRef.current;
    reactionFocusRef.current = null;
    setMenuPostId(null);
    setBlockTarget(null);
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
      {phase === 'ready' && mode === 'enabled' && profile === null ? (
        <div className="flex flex-col items-start gap-[var(--space-2)]">
          <p>친구 기능을 시작하려면 별명을 먼저 정해 주세요.</p>
          <Button variant="outline" onClick={onOpenFriends}>
            별명 정하러 가기
          </Button>
        </div>
      ) : null}
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
      {phase === 'ready' &&
      profile !== null &&
      mode !== 'off' &&
      canShow &&
      posts.length === 0 &&
      pageIndex > 0 ? (
        <div className="flex flex-col items-start gap-[var(--space-2)]">
          <p>이 페이지에 표시할 기록이 없어요.</p>
          <Button variant="outline" onClick={() => void showNew()}>
            처음부터 다시 보기
          </Button>
        </div>
      ) : null}
      {phase === 'ready' &&
      profile !== null &&
      mode !== 'off' &&
      canShow &&
      posts.length === 0 &&
      pageIndex === 0 ? (
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
              menuOpen={menuPostId === post.id}
              onReact={reaction.setReaction}
              onToggleMenu={() =>
                setMenuPostId((current) => (current === post.id ? null : post.id))
              }
              onCloseMenu={() => setMenuPostId(null)}
              onRequestBlock={(postId, peerId) => {
                if (profile)
                  setBlockTarget({
                    postId,
                    peerId,
                    profileId: profile.id,
                    navigation: navigationRef.current,
                  });
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
      <Dialog
        open={blockTarget !== null && phase !== 'blocked' && phase !== 'error' && mode !== 'off'}
        onClose={() => setBlockTarget(null)}
        role="alertdialog"
        title="이 사용자를 차단할까요?"
        description={
          phase === 'loading'
            ? '기록 권한을 다시 확인하고 있어요. 확인이 끝나면 차단할 수 있어요.'
            : '친구 관계와 요청이 끊기고 서로의 공유를 볼 수 없어요. 상대에게 알림은 보내지 않아요.'
        }
        initialFocusRef={blockCancelRef}
        returnFocus={() => headingRef.current}
        className="max-w-[400px]"
        footer={
          <>
            <Button ref={blockCancelRef} variant="outline" onClick={() => setBlockTarget(null)}>
              취소
            </Button>
            <Button
              variant="danger"
              disabled={phase !== 'ready' || !canShow || block.busy}
              onClick={() => {
                if (blockTarget === null) return;
                void block.block(blockTarget.peerId).then((done) => {
                  if (done) setBlockTarget(null);
                });
              }}
            >
              차단
            </Button>
          </>
        }
      />
      {hasNew && canShow ? (
        <Button variant="outline" onClick={() => void showNew()}>
          새 기록 보기
        </Button>
      ) : null}
      {phase === 'ready' && profile !== null && mode !== 'off' ? (
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
