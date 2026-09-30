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
  canCancelReaction?: boolean;
  onReactionStart?: () => { complete: () => Promise<void>; cancel: () => void };
  anonymous?: boolean;
  onChanged: () => void;
  returnFocus: () => HTMLElement | null;
};
export function SocialPostCard({
  post,
  own,
  canWrite,
  canCancelReaction = false,
  onReactionStart,
  anonymous = false,
  onChanged,
  returnFocus,
}: SocialPostCardProps) {
  const menuRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const close = () => {
    if (command.busy) return;
    if (command.uncertain) setLeaving(true);
    else setConfirm(null);
  };
  const [confirm, setConfirm] = useState<'delete' | 'block' | null>(null);
  const command = useSocialCommand(`post-${post.id}`);
  const reaction = async () => {
    const restore = onReactionStart?.();
    const input = { postId: post.id, active: !post.myReaction };
    const result = command.uncertain
      ? await command.retry()
      : await command.run(`reaction-${post.id}`, JSON.stringify(input), (repo, options) =>
          repo.setReaction(input, options),
        );
    if (result !== null) {
      if (restore) await restore.complete();
      else onChanged();
    } else restore?.cancel();
  };
  const apply = async () => {
    const action = confirm;
    const result = command.uncertain
      ? await command.retry()
      : action === 'delete'
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
            disabled={command.uncertain}
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
            disabled={
              command.uncertain
                ? !command.retryAllowed || !command.pending?.operation.startsWith('reaction-')
                : !canWrite && !(canCancelReaction && post.myReaction)
            }
            loading={command.busy}
            onClick={() => void reaction()}
          >
            {command.uncertain ? '완료 여부 확인' : post.myReaction ? '응원 취소' : '응원하기'}
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
          onClose={close}
          initialFocusRef={cancelRef}
          returnFocus={returnFocus}
          footer={
            <>
              <Button ref={cancelRef} variant="outline" disabled={command.busy} onClick={close}>
                취소
              </Button>
              <Button
                variant="danger"
                disabled={command.uncertain && !command.retryAllowed}
                loading={command.busy}
                onClick={() => void apply()}
              >
                {command.uncertain ? '완료 여부 확인' : confirm === 'delete' ? '공유 삭제' : '차단'}
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
      {command.uncertain &&
      !command.pending?.operation.startsWith('reaction-') &&
      confirm === null ? (
        <Button disabled={!command.retryAllowed} onClick={() => void apply()}>
          완료 여부 확인
        </Button>
      ) : null}
      <Dialog
        open={leaving}
        role="alertdialog"
        title="완료 여부를 나중에 확인할까요?"
        onClose={() => setLeaving(false)}
        initialFocusRef={continueRef}
        footer={
          <>
            <Button ref={continueRef} variant="outline" onClick={() => setLeaving(false)}>
              같은 요청으로 확인
            </Button>
            <Button
              onClick={() => {
                setLeaving(false);
                setConfirm(null);
              }}
            >
              나중에 확인
            </Button>
          </>
        }
      >
        <p>
          요청이 이미 적용됐을 수 있어요. 완료 여부 확인에서 같은 요청으로 다시 확인할 수 있어요.
        </p>
      </Dialog>
    </article>
  );
}
