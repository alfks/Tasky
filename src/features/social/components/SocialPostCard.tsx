import { useRef, useState } from 'react';

import type { PostView } from '@/domain/social/social';

import { socialFailureMessage, useSocialCommand } from '@/features/social/hooks/useSocialCommand';
import { invalidateSocialSession, recheckSocialSession } from '@/features/social/session-lifecycle';


import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { IconButton } from '@/components/ui/IconButton';
import { Menu } from '@/components/ui/Menu';
import { Popover } from '@/components/ui/Popover';

type SocialPostCardProps = {
  post: PostView;
  own: boolean;
  canWrite: boolean;
  anonymous?: boolean;
  onChanged: () => void;
  returnFocus: () => HTMLElement | null;
};
export function SocialPostCard({
  post,
  own,
  canWrite,
  anonymous = false,
  onChanged,
  returnFocus,
}: SocialPostCardProps) {
  const menuRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<'delete' | 'block' | null>(null);
  const command = useSocialCommand();
  const reaction = async () => {
    const input = { postId: post.id, active: !post.myReaction };
    if (
      (await command.run(`reaction-${post.id}`, JSON.stringify(input), (repo, options) =>
        repo.setReaction(input, options),
      )) !== null
    )
      onChanged();
  };
  const apply = async () => {
    const action = confirm;
    const result =
      action === 'delete'
        ? await command.run(`delete-${post.id}`, post.id, (repo, options) =>
            repo.deletePost({ id: post.id }, options),
          )
        : await command.run(`block-${post.author.id}`, post.author.id, (repo, options) =>
            repo.setBlock({ peerId: post.author.id, blocked: true }, options),
          );
    if (result !== null) {
      setConfirm(null);
      invalidateSocialSession('revoked');
      await recheckSocialSession();
      onChanged();
    }
  };
  const audience =
    post.category?.visibility === 'public'
      ? '모두 공개'
      : post.category?.visibility === 'private'
        ? '나만 보기'
        : '친구만';
  return (
    <article
      id={`social-post-${post.id}`}
      aria-label={`${post.author.nickname}의 공유 기록`}
      tabIndex={-1}
      className="flex min-w-0 flex-col gap-[var(--space-3)] rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-4)] outline-none focus-visible:outline-2 focus-visible:outline-focus"
    >
      <div className="flex min-w-0 items-start justify-between gap-[var(--space-2)]">
        <div className="min-w-0">
          <h3 className="text-base font-semibold break-words">{post.author.nickname}</h3>
          <p className="text-sm text-muted">
            {post.happenedOn} · {audience}
          </p>
        </div>
        {anonymous ? null : (
          <IconButton
            ref={menuRef}
            label={`${post.author.nickname} 기록 더 보기`}
            onClick={() => setMenuOpen((open) => !open)}
          >
            ⋯
          </IconButton>
        )}
      </div>
      {post.category === undefined ? null : (
        <p className="flex items-center gap-[var(--space-2)] text-sm text-muted">
          <span
            aria-hidden="true"
            style={{ backgroundColor: post.category.color }}
            className="size-[12px] shrink-0 rounded-full"
          />
          {post.category.emoji} {post.category.name}
        </p>
      )}
      <p className="text-base break-words whitespace-pre-wrap text-text">{post.text}</p>
      <div className="flex flex-wrap items-center gap-[var(--space-2)]">
        {anonymous ? (
          <a
            href="/?social=public"
            className="text-sm text-text underline focus-visible:outline-2 focus-visible:outline-focus"
          >
            로그인하고 응원하기
          </a>
        ) : own ? (
          <span className="text-sm text-muted">내 기록</span>
        ) : (
          <Button
            variant="outline"
            size="sm"
            aria-pressed={post.myReaction}
            disabled={!canWrite}
            loading={command.busy}
            onClick={() => void reaction()}
          >
            {post.myReaction ? '응원 취소' : '응원하기'}
          </Button>
        )}
        <span aria-label={`응원 ${post.reactionCount}개`} className="text-sm text-muted">
          ♥ {post.reactionCount}
        </span>
      </div>
      {command.error === null ? null : <p role="alert">{socialFailureMessage(command.error)}</p>}
      <Popover
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        anchorRef={menuRef}
        hasPopup="menu"
        placement="bottom-end"
      >
        <Menu
          label="기록 메뉴"
          onClose={() => setMenuOpen(false)}
          items={[
            {
              id: own ? 'delete' : 'block',
              label: own ? '공유 삭제' : '작성자 차단',
              destructive: true,
              onSelect: () => setConfirm(own ? 'delete' : 'block'),
            },
          ]}
        />
      </Popover>
      {confirm === null ? null : (
        <Dialog
          open
          role="alertdialog"
          title={confirm === 'delete' ? '공유한 기록을 삭제할까요?' : '작성자를 차단할까요?'}
          onClose={() => {
            if (!command.busy) setConfirm(null);
          }}
          initialFocusRef={cancelRef}
          returnFocus={returnFocus}
          footer={
            <>
              <Button
                ref={cancelRef}
                variant="outline"
                disabled={command.busy}
                onClick={() => setConfirm(null)}
              >
                취소
              </Button>
              <Button variant="danger" loading={command.busy} onClick={() => void apply()}>
                {confirm === 'delete' ? '공유 삭제' : '차단'}
              </Button>
            </>
          }
        >
          <p>
            {confirm === 'delete'
              ? '이 공유와 응원이 삭제돼요. 원래 할 일은 그대로이고 공유는 복원할 수 없어요.'
              : '이 계정에서는 서로의 기록을 숨겨요. 모두 공개인 기록은 로그아웃하면 볼 수 있어요.'}
          </p>
          {command.error === null ? null : (
            <p role="alert">{socialFailureMessage(command.error)}</p>
          )}
        </Dialog>
      )}
    </article>
  );
}
