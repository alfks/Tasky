import { useState } from 'react';

import { SocialPagination } from '@/features/social/components/SocialPagination';
import { socialFailureMessage, useSocialCommand } from '@/features/social/hooks/useSocialCommand';
import { useSocialResource } from '@/features/social/hooks/useSocialResource';

import { Button } from '@/components/ui/Button';

type SocialInvitesProps = { enabled: boolean };
export function SocialInvites({ enabled }: SocialInvitesProps) {
  const invites = useSocialResource((repo, cursor) =>
    repo.invites(cursor === undefined ? undefined : { cursor }),
  );
  const command = useSocialCommand('invites');
  const [link, setLink] = useState('');
  const [notice, setNotice] = useState('');
  const create = async () => {
    const result = await command.run('invite-create', 'new-invite', (repo, options) =>
      repo.createInvite(options),
    );
    if (result === null) return;
    if ('token' in result) {
      setLink(`${location.origin}/#invite=${result.token}`);
      setNotice('초대 링크를 직접 전달해 주세요.');
    } else {
      setLink('');
      setNotice(
        '초대는 만들어졌지만 링크를 다시 보여줄 수 없어요. 기존 초대를 취소한 뒤 새로 만들어 주세요.',
      );
    }
    await invites.refresh();
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setNotice('초대 링크를 복사했어요.');
    } catch {
      setNotice('복사하지 못했어요. 아래 링크를 선택해서 직접 복사해 주세요.');
    }
  };
  const revoke = async (inviteId: string) => {
    if (
      (await command.run(`invite-revoke-${inviteId}`, inviteId, (repo, options) =>
        repo.revokeInvite({ inviteId }, options),
      )) !== null
    ) {
      setLink('');
      await invites.refresh();
      setNotice('초대를 취소했어요.');
    }
  };
  const statuses = { active: '사용 가능', used: '사용됨', revoked: '취소됨', expired: '만료됨' };
  return (
    <section
      aria-labelledby="social-invites-heading"
      className="flex flex-col gap-[var(--space-3)]"
    >
      <h3 id="social-invites-heading" className="text-base font-semibold">
        친구 초대
      </h3>
      <Button
        disabled={
          !enabled ||
          (command.uncertain &&
            (!command.retryAllowed || command.pending?.operation !== 'invite-create'))
        }
        loading={command.busy}
        onClick={() => void create()}
      >
        {command.uncertain && command.pending?.operation === 'invite-create'
          ? '완료 여부 확인'
          : '초대 만들기'}
      </Button>
      {link === '' ? null : (
        <div className="flex flex-col gap-[var(--space-2)]">
          <label>
            초대 링크
            <input
              readOnly
              value={link}
              onFocus={(event) => event.target.select()}
              className="w-full min-w-0 rounded-[var(--radius-md)] border border-border bg-surface p-[var(--space-2)] text-sm focus-visible:outline-2 focus-visible:outline-focus"
            />
          </label>
          <Button variant="outline" onClick={() => void copy()}>
            링크 복사
          </Button>
        </div>
      )}
      <p role="status" aria-live="polite" className="text-sm text-muted">
        {notice}
      </p>
      {command.uncertain && command.pending?.operation !== 'invite-create' ? (
        <Button
          disabled={!command.retryAllowed}
          onClick={() =>
            void command.retry().then(async (result) => {
              if (result !== null) await invites.refresh();
            })
          }
        >
          완료 여부 확인
        </Button>
      ) : null}
      {invites.busy ? <p role="status">초대를 불러오는 중</p> : null}
      {command.error === null && invites.error === null ? null : (
        <p role="alert">{socialFailureMessage(command.error ?? invites.error)}</p>
      )}
      <ul className="flex flex-col gap-[var(--space-2)]">
        {invites.items.map((invite) => (
          <li
            key={invite.inviteId}
            className="flex flex-wrap items-center justify-between gap-[var(--space-2)] rounded-[var(--radius-md)] border border-border p-[var(--space-3)]"
          >
            <span>
              {statuses[invite.status]} · {new Date(invite.expiresAt).toLocaleString('ko-KR')} 만료
            </span>
            {invite.status === 'active' ? (
              <Button
                variant="outline"
                size="sm"
                loading={command.busy}
                disabled={command.uncertain}
                onClick={() => void revoke(invite.inviteId)}
              >
                초대 취소
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      <SocialPagination
        pageIndex={invites.pageIndex}
        nextCursor={invites.nextCursor}
        busy={invites.busy}
        onNext={() => void invites.next()}
        onPrevious={() => void invites.previous()}
      />
    </section>
  );
}
