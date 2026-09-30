import { useRef, useState } from 'react';

import type { FriendView } from '@/domain/social/social';

import { SocialPagination } from '@/features/social/components/SocialPagination';
import { socialFailureMessage, useSocialCommand } from '@/features/social/hooks/useSocialCommand';
import { useSocialResource } from '@/features/social/hooks/useSocialResource';
import { invalidateSocialSession, recheckSocialSession } from '@/features/social/session-lifecycle';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

type SocialConnectionsProps = { blocked?: boolean };
export function SocialConnections({ blocked = false }: SocialConnectionsProps) {
  const list = useSocialResource((repo, cursor) =>
    blocked
      ? repo.blocks(cursor === undefined ? undefined : { cursor })
      : repo.friends(cursor === undefined ? undefined : { cursor }),
  );
  const command = useSocialCommand();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [pending, setPending] = useState<{
    friend: FriendView;
    action: 'remove' | 'block' | 'unblock';
  } | null>(null);
  const [notice, setNotice] = useState('');
  const apply = async () => {
    if (pending === null) return;
    const { friend, action } = pending;
    const input = { peerId: friend.id, expectedVersion: friend.pairVersion };
    const result = await command.run(
      `${action}-${friend.id}`,
      JSON.stringify(input),
      (repo, options) =>
        action === 'remove'
          ? repo
              .removeFriend(input, options)
              .then((value) => ({ ...value, data: { pairVersion: value.data.pairVersion } }))
          : repo
              .setBlock({ ...input, blocked: action === 'block' }, options)
              .then((value) => ({ ...value, data: { pairVersion: value.data.pairVersion } })),
      async (code) => {
        if (code !== 'conflict') return;
        setPending(null);
        setNotice('요청 상태가 바뀌었어요. 최신 내용을 확인해 주세요.');
        await list.refresh();
        headingRef.current?.focus();
      },
    );
    if (result === null) return;
    setPending(null);
    setNotice(
      action === 'remove'
        ? '친구를 삭제했어요.'
        : action === 'block'
          ? '사용자를 차단했어요.'
          : '차단을 해제했어요.',
    );
    invalidateSocialSession('revoked');
    await recheckSocialSession();
  };
  const title = blocked ? '차단한 사용자' : '친구 목록';
  return (
    <section aria-label={title} className="flex flex-col gap-[var(--space-3)]">
      <h3 ref={headingRef} tabIndex={-1} className="text-base font-semibold outline-none">
        {title}
      </h3>
      {list.busy ? <p role="status">목록을 불러오는 중</p> : null}
      {list.items.length === 0 && !list.busy ? (
        <p className="text-sm text-muted">
          {blocked ? '차단한 사용자가 없어요' : '친구를 초대해 완료한 일을 나눠 보세요'}
        </p>
      ) : null}
      {list.error === null ? null : (
        <p role="alert">
          {socialFailureMessage(list.error)}
          <Button variant="outline" size="sm" onClick={() => void list.refresh()}>
            다시 시도
          </Button>
        </p>
      )}
      <ul className="flex flex-col gap-[var(--space-2)]">
        {list.items.map((friend) => (
          <li
            key={friend.id}
            className="flex flex-wrap items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-md)] border border-border p-[var(--space-3)]"
          >
            <span className="break-words">{friend.nickname}</span>
            <div className="flex flex-wrap gap-[var(--space-2)]">
              {blocked ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPending({ friend, action: 'unblock' })}
                >
                  차단 해제
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setPending({ friend, action: 'remove' })}
                  >
                    친구 삭제
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPending({ friend, action: 'block' })}
                  >
                    차단
                  </Button>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>
      <SocialPagination
        pageIndex={list.pageIndex}
        nextCursor={list.nextCursor}
        busy={list.busy}
        onNext={() => void list.next()}
        onPrevious={() => void list.previous()}
      />
      <p role="status" aria-live="polite">
        {notice}
      </p>
      {pending === null ? null : (
        <Dialog
          open
          title={`${pending.friend.nickname}님 ${pending.action === 'remove' ? '친구 삭제' : pending.action === 'block' ? '차단' : '차단 해제'}`}
          role="alertdialog"
          onClose={() => {
            if (!command.busy) setPending(null);
          }}
          initialFocusRef={cancelRef}
          returnFocus={() => headingRef.current}
          footer={
            <>
              <Button
                ref={cancelRef}
                variant="outline"
                disabled={command.busy}
                onClick={() => setPending(null)}
              >
                취소
              </Button>
              <Button variant="danger" loading={command.busy} onClick={() => void apply()}>
                확인
              </Button>
            </>
          }
        >
          <p>
            {pending.action === 'unblock'
              ? '친구, 요청과 응원은 복원되지 않아요.'
              : pending.action === 'remove'
                ? '서로의 친구 전용 기록을 볼 수 없게 돼요. 모두 공개 기록은 계속 볼 수 있어요.'
                : '이 계정에서는 서로의 기록을 숨겨요. 모두 공개인 기록은 로그아웃하면 볼 수 있어요.'}
          </p>
          {command.error === null ? null : (
            <p role="alert">{socialFailureMessage(command.error)}</p>
          )}
        </Dialog>
      )}
    </section>
  );
}
