import { useState } from 'react';

import { socialFailureMessage, useSocialCommand } from '@/features/social/hooks/useSocialCommand';
import { useSocialResource } from '@/features/social/hooks/useSocialResource';
import { clearPendingInvite, pendingInviteToken } from '@/features/social/lib/invite-fragment';

import { Button } from '@/components/ui/Button';

type InviteLandingProps = { enabled: boolean; onDone: () => void };
export function InviteLanding({ enabled, onDone }: InviteLandingProps) {
  const [token] = useState(pendingInviteToken);
  const command = useSocialCommand();
  const resource = useSocialResource(async (repo) => {
    if (token === null) return { data: { items: [], nextCursor: null }, serverTime: Date.now() };
    const response = await repo.previewInvite({ token });
    return { ...response, data: { items: [response.data], nextCursor: null } };
  });
  const preview = resource.items[0] ?? null;
  const send = async () => {
    if (token === null) return;
    const sent = await command.run('invite-send', token, (repo, options) =>
      repo.sendRequest({ token }, options),
    );
    if (sent !== null) {
      clearPendingInvite();
      onDone();
    }
  };
  const cancel = () => {
    clearPendingInvite();
    onDone();
  };
  return (
    <section
      aria-label="친구 초대 확인"
      className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-4)]"
    >
      <h2 className="text-lg font-semibold">친구 초대 확인</h2>
      {preview === null ? (
        <p>
          {resource.busy
            ? '초대를 확인하는 중'
            : '사용할 수 없는 초대예요. 새 초대를 부탁해 주세요.'}
        </p>
      ) : (
        <>
          <p>{preview.nickname}님에게 친구 요청을 보낼까요?</p>
          <p className="text-sm text-muted">
            {new Date(preview.expiresAt).toLocaleString('ko-KR')}까지 사용할 수 있어요. 상대가
            수락해야 친구가 돼요.
          </p>
        </>
      )}
      {command.error === null && resource.error === null ? null : (
        <p role="alert">{socialFailureMessage(command.error ?? resource.error)}</p>
      )}
      <div className="flex flex-wrap gap-[var(--space-2)]">
        <Button variant="outline" onClick={cancel}>
          초대 닫기
        </Button>
        <Button
          disabled={!enabled || preview === null}
          loading={command.busy}
          onClick={() => void send()}
        >
          친구 요청 보내기
        </Button>
      </div>
    </section>
  );
}
