'use client';

import { useRef, useState } from 'react';

import type { PostView, SocialMode } from '@/domain/social/social';

import { Button } from '@/components/ui/Button';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Menu } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';

type SocialFeedCardProps = {
  post: PostView;
  mode: SocialMode | null;
  ownProfileId: string | null;
  busy: boolean;
  onReact: (postId: string, active: boolean) => Promise<boolean>;
  onBlock: (peerId: string) => Promise<boolean>;
};

export function SocialFeedCard({
  post,
  mode,
  ownProfileId,
  busy,
  onReact,
  onBlock,
}: SocialFeedCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmBlock, setConfirmBlock] = useState(false);
  const menuAnchorRef = useRef<HTMLButtonElement>(null);
  const isOwn = post.author.id === ownProfileId;

  return (
    <article className="rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-4)] shadow-sm">
      <div className="flex flex-wrap justify-between gap-[var(--space-2)]">
        <h3 className="font-semibold">{post.author.nickname}</h3>
        <time dateTime={post.happenedOn} className="text-sm text-muted">
          {post.happenedOn}
        </time>
      </div>
      <p className="mt-[var(--space-3)] break-words whitespace-pre-wrap">{post.text}</p>
      <div className="mt-[var(--space-3)] flex flex-wrap items-center gap-[var(--space-2)]">
        <Button
          variant={post.myReaction ? 'outline' : 'ghost'}
          disabled={busy || (mode !== 'enabled' && !post.myReaction) || isOwn}
          aria-pressed={post.myReaction}
          aria-label={`${post.author.nickname}님의 ${post.happenedOn} 공유 응원 ${post.reactionCount}개`}
          data-social-reaction-id={post.id}
          onClick={() => void onReact(post.id, !post.myReaction)}
        >
          응원 {post.reactionCount}
        </Button>
        {!isOwn ? (
          <>
            <Button
              ref={menuAnchorRef}
              variant="ghost"
              aria-label={`${post.author.nickname}님 공유 더 보기`}
              onClick={() => setMenuOpen((open) => !open)}
            >
              더 보기
            </Button>
            <Popover
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              anchorRef={menuAnchorRef}
              hasPopup="menu"
            >
              <Menu
                label={`${post.author.nickname}님 기록 메뉴`}
                items={[
                  {
                    id: 'block',
                    label: '사용자 차단',
                    destructive: true,
                    onSelect: () => {
                      setMenuOpen(false);
                      setConfirmBlock(true);
                    },
                  },
                ]}
                onClose={() => setMenuOpen(false)}
              />
            </Popover>
          </>
        ) : null}
      </div>
      <ConfirmDialog
        open={confirmBlock}
        title={`${post.author.nickname}님을 차단할까요?`}
        description="친구 관계와 요청이 끊기고 서로의 공유를 볼 수 없어요. 상대에게 알림은 보내지 않아요."
        confirmLabel="차단"
        onConfirm={() => {
          if (!busy)
            void onBlock(post.author.id).then((done) => {
              if (done) setConfirmBlock(false);
            });
        }}
        onCancel={() => setConfirmBlock(false)}
        returnFocus={() => document.getElementById('social-feed-title')}
      />
    </article>
  );
}
