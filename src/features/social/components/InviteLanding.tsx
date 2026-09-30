import { useEffect, useRef, useState } from 'react';

import { socialFailureMessage, useSocialCommand } from '@/features/social/hooks/useSocialCommand';
import { useSocialResource } from '@/features/social/hooks/useSocialResource';
import { clearPendingInvite, pendingInviteToken } from '@/features/social/lib/invite-fragment';

import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';

type InviteLandingProps = { enabled: boolean; onDone: () => void };
export function InviteLanding({ enabled, onDone }: InviteLandingProps) {
  const [token, setToken] = useState(pendingInviteToken);
  const [notice, setNotice] = useState('');
  const [leaving, setLeaving] = useState(false);
  const continueRef = useRef<HTMLButtonElement>(null);
  const command = useSocialCommand('invite-send');
  const resource = useSocialResource(async (repo) => {
    const observedToken = pendingInviteToken();
    if (observedToken === null)
      return { data: { items: [], nextCursor: null }, serverTime: Date.now() };
    const response = await repo.previewInvite({ token: observedToken });
    return { ...response, data: { items: [response.data], nextCursor: null } };
  });
  const refreshInvite = resource.refresh;
  useEffect(() => {
    const receive = () => {
      setToken(pendingInviteToken());
      void refreshInvite();
    };
    window.addEventListener('tasky-social-invite', receive);
    return () => window.removeEventListener('tasky-social-invite', receive);
  }, [refreshInvite]);
  const recoveringOther =
    command.pending !== null &&
    (command.uncertain || command.busy) &&
    command.pending.signature !== token;
  const preview = recoveringOther ? null : (resource.items[0] ?? null);
  const send = async () => {
    if (token === null && !command.uncertain) return;
    const submittedToken = command.pending?.signature ?? token;
    const sent = command.uncertain
      ? await command.retry()
      : await command.run('invite-send', token!, (repo, options) =>
          repo.sendRequest({ token: token! }, options),
        );
    if (sent !== null) {
      const latestToken = pendingInviteToken();
      if (latestToken !== submittedToken) {
        setToken(latestToken);
        setNotice('이전에 보낸 요청을 확인했어요. 새 초대는 내용을 확인하고 따로 결정해 주세요.');
        await resource.refresh();
      } else {
        clearPendingInvite();
        onDone();
      }
    }
  };
  const cancel = () => {
    if (command.uncertain) {
      setLeaving(true);
      return;
    }
    clearPendingInvite();
    onDone();
  };
  return (
    <>
      <section
        aria-label="친구 초대 확인"
        className="flex flex-col gap-[var(--space-3)] rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-4)]"
      >
        <h2 className="text-lg font-semibold">친구 초대 확인</h2>
        {preview === null ? (
          <p>
            {recoveringOther
              ? '이전에 보낸 친구 요청의 완료 여부를 먼저 확인해 주세요. 새 초대는 아직 제출하지 않아요.'
              : resource.busy
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
        <p role="status">{notice}</p>
        {command.error === null && resource.error === null ? null : (
          <p role="alert">{socialFailureMessage(command.error ?? resource.error)}</p>
        )}
        <div className="flex flex-wrap gap-[var(--space-2)]">
          <Button variant="outline" onClick={cancel}>
            초대 닫기
          </Button>
          <Button
            disabled={!enabled || (command.uncertain ? !command.retryAllowed : preview === null)}
            loading={command.busy}
            onClick={() => void send()}
          >
            {command.uncertain ? '완료 여부 확인' : '친구 요청 보내기'}
          </Button>
        </div>
      </section>
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
                clearPendingInvite();
                onDone();
              }}
            >
              나중에 확인
            </Button>
          </>
        }
      >
        <p>친구 요청이 이미 보내졌을 수 있어요. 친구 관리에서 현재 요청을 확인해 주세요.</p>
      </Dialog>
    </>
  );
}
