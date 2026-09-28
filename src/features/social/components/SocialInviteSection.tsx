'use client';

import { useEffect, useState } from 'react';

import type { useSocialRelations } from '@/features/social/hooks/useSocialRelations';
import type { InviteBootstrap } from '@/features/social/lib/invite-bootstrap';

import { Button } from '@/components/ui/Button';

type SocialInviteSectionProps = {
  relations: ReturnType<typeof useSocialRelations>;
  invite: InviteBootstrap | null;
  onClearInvite: () => void;
};

function restoreInviteFocus(id = 'social-invites-title'): void {
  requestAnimationFrame(() => {
    const tab = document.getElementById('social-tab-friends');
    if (tab?.getAttribute('aria-selected') !== 'true') return;
    const target = document.getElementById(id) ?? tab;
    if (!target.closest('[hidden]')) target.focus({ preventScroll: true });
  });
}

export function SocialInviteSection({
  relations,
  invite,
  onClearInvite,
}: SocialInviteSectionProps) {
  const [copyFailed, setCopyFailed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const { data, busy, preview, previewPhase, createdInvite, previewInvite } = relations;
  const profile = data.me?.profile;
  const mode = data.me?.mode;

  useEffect(() => {
    if (profile == null || mode === 'off' || invite?.kind !== 'invite') return;
    void previewInvite(invite.token);
  }, [invite, mode, profile, previewInvite]);

  const visibleInvite = createdInvite && 'token' in createdInvite ? createdInvite : null;
  const shareLink = visibleInvite
    ? `${location.origin}${location.pathname}#invite=${visibleInvite.token}`
    : null;
  const copyLink = async () => {
    if (shareLink === null) return;
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyFailed(false);
      setNotice('초대 링크를 복사했어요.');
    } catch {
      setCopyFailed(true);
    }
  };

  return (
    <div className="flex flex-col gap-[var(--space-4)]">
      {notice ? <p role="status">{notice}</p> : null}
      {invite?.kind === 'invalid' ? (
        <section
          role="alert"
          className="rounded-[var(--radius-xl)] border border-border p-[var(--space-4)]"
        >
          <p>사용할 수 없는 초대예요. 새 초대를 부탁해 주세요.</p>
          <Button variant="ghost" onClick={onClearInvite}>
            초대 닫기
          </Button>
        </section>
      ) : null}
      {invite?.kind === 'invite' ? (
        <section
          aria-label="받은 초대"
          className="rounded-[var(--radius-xl)] border border-border p-[var(--space-4)]"
        >
          {profile == null ? (
            <p>별명을 만든 뒤 초대를 확인할 수 있어요.</p>
          ) : mode === 'off' ? (
            <p>지금은 초대를 확인할 수 없어요.</p>
          ) : previewPhase === 'loading' ? (
            <p role="status">초대를 확인하는 중이에요.</p>
          ) : preview ? (
            <>
              <p>
                <strong>{preview.nickname}</strong>님의 초대예요. 친구 요청을 보내면 상대가 수락할
                때 연결돼요.
              </p>
              <div className="mt-[var(--space-2)] flex gap-[var(--space-2)]">
                <Button
                  disabled={busy || mode !== 'enabled'}
                  onClick={() =>
                    void relations.request(invite.token).then((done) => {
                      if (done) {
                        onClearInvite();
                        setNotice('친구 요청을 보냈어요.');
                        restoreInviteFocus('social-outgoing-title');
                      }
                    })
                  }
                >
                  친구 요청 보내기
                </Button>
              </div>
            </>
          ) : (
            <p role="alert">사용할 수 없는 초대예요. 새 초대를 부탁해 주세요.</p>
          )}
          <Button variant="outline" onClick={onClearInvite}>
            초대 닫기
          </Button>
        </section>
      ) : null}
      {profile ? (
        <section
          aria-labelledby="social-invites-title"
          className="flex flex-col gap-[var(--space-2)]"
        >
          <h2 id="social-invites-title" tabIndex={-1} className="font-semibold outline-none">
            친구 초대
          </h2>
          <Button
            disabled={busy || mode !== 'enabled'}
            onClick={() => void relations.invite().then(() => restoreInviteFocus())}
          >
            초대 만들기
          </Button>
          {createdInvite && 'tokenUnavailable' in createdInvite ? (
            <p role="alert">
              이전 초대가 만들어졌지만 링크 원문을 다시 보여 줄 수 없어요. 새 초대를 만들어 주세요.
            </p>
          ) : null}
          {visibleInvite && shareLink ? (
            <div className="flex flex-col gap-[var(--space-2)]">
              <label className="text-sm">
                초대 링크
                <input
                  readOnly
                  value={shareLink}
                  onFocus={(event) => event.currentTarget.select()}
                  className="mt-[var(--space-1)] w-full rounded-[var(--radius-md)] border border-border bg-bg p-[var(--space-2)]"
                />
              </label>
              <p className="text-sm text-muted">
                이 링크는 한 번만 사용할 수 있고{' '}
                {new Date(visibleInvite.expiresAt).toLocaleString('ko-KR')}에 만료돼요.
              </p>
              <Button variant="outline" onClick={() => void copyLink()}>
                링크 복사
              </Button>
              {copyFailed ? (
                <p role="alert">자동 복사에 실패했어요. 위 링크를 선택해 직접 복사해 주세요.</p>
              ) : null}
            </div>
          ) : null}
          {data.invites.map((item) => (
            <div
              key={item.inviteId}
              className="flex flex-wrap items-center gap-[var(--space-2)] border-b border-border py-[var(--space-2)]"
            >
              <span>
                초대 ·{' '}
                {item.status === 'active'
                  ? '사용 가능'
                  : item.status === 'used'
                    ? '사용됨'
                    : item.status === 'expired'
                      ? '만료됨'
                      : '취소됨'}{' '}
                · {new Date(item.expiresAt).toLocaleString('ko-KR')}
              </span>
              {item.status === 'active' ? (
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() =>
                    void relations.revokeInvite(item.inviteId).then((done) => {
                      if (done) {
                        setNotice('초대를 취소했어요.');
                        restoreInviteFocus();
                      }
                    })
                  }
                >
                  초대 취소
                </Button>
              ) : null}
            </div>
          ))}
          {data.next.invites ? (
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void relations.loadMore('invites')}
            >
              초대 더 보기
            </Button>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
