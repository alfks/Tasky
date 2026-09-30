import { useEffect, useRef, useState } from 'react';

import type { SocialCategoryView } from '@/domain/social/social';

import { InviteLanding } from '@/features/social/components/InviteLanding';
import { SocialFeed } from '@/features/social/components/SocialFeed';
import { SocialFriendsPanel } from '@/features/social/components/SocialFriendsPanel';
import { SocialOnboarding } from '@/features/social/components/SocialOnboarding';
import { SocialPendingCommands } from '@/features/social/components/SocialPendingCommands';
import { SocialProfileSettings } from '@/features/social/components/SocialProfileSettings';
import { SocialShareDialog } from '@/features/social/components/SocialShareDialog';
import { pendingInviteToken } from '@/features/social/lib/invite-fragment';
import {
  captureSocialDispatch,
  onSocialInvalidation,
  invalidateSocialSession,
  recheckSocialSession,
} from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

import { Button } from '@/components/ui/Button';

export type CompletedSocialChoice = {
  key: string;
  text: string;
  happenedOn: string;
  categoryLabel: string;
  resolveCategory: () => Promise<SocialCategoryView | null>;
  onChangeAudience: () => void;
};
export type SocialScreenProps = {
  choices: readonly CompletedSocialChoice[];
  date: string;
  choicesLoading: boolean;
  onDateChange: (date: string) => void;
  onReturn: () => void;
  initialPublic?: boolean;
  onManageCategories?: () => void;
};

export function SocialScreen({
  choices,
  date,
  choicesLoading,
  onDateChange,
  onReturn,
  initialPublic = false,
  onManageCategories,
}: SocialScreenProps) {
  const [tab, setTab] = useState<'feed' | 'friends' | 'mine'>('feed');
  const [invite, setInvite] = useState(() => pendingInviteToken() !== null);
  const [sharing, setSharing] = useState(false);
  const [notice, setNotice] = useState('');
  const titleRef = useRef<HTMLHeadingElement>(null);
  const aliveRef = useRef(false);
  const phase = useSocialStore((state) => state.phase);
  const mode = useSocialStore((state) => state.mode);
  const profile = useSocialStore((state) => state.profile);
  const view = useSocialStore((state) => state.view);
  const pageIndex = useSocialStore((state) => state.pageIndex);
  const cursor = useSocialStore((state) => state.cursorStack[state.pageIndex]);
  useEffect(() => {
    aliveRef.current = true;
    void useSocialStore
      .getState()
      .open()
      .then(() => {
        if (initialPublic) void useSocialStore.getState().setView('public');
      });
    titleRef.current?.focus();
    const receiveInvite = () => {
      if (pendingInviteToken() !== null) setInvite(true);
    };
    window.addEventListener('tasky-social-invite', receiveInvite);
    const stop = onSocialInvalidation((reason) => {
      if (reason === 'account') {
        setSharing(false);
        setInvite(false);
        setNotice('');
      }
    });
    return () => {
      aliveRef.current = false;
      window.removeEventListener('tasky-social-invite', receiveInvite);
      stop();
      useSocialStore.getState().close();
    };
  }, [initialPublic]);
  const chooseTab = (next: 'feed' | 'friends' | 'mine') => {
    setTab(next);
    if (next === 'mine') void useSocialStore.getState().setView('mine');
    if (next === 'feed') void useSocialStore.getState().setView('friends');
  };
  return (
    <main
      id="shell-main"
      tabIndex={-1}
      className="flex min-h-0 min-w-0 flex-1 flex-col outline-none"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[680px] flex-1 flex-col gap-[var(--space-4)] overflow-y-auto px-[var(--space-2)] pb-[var(--space-4)]">
        <header className="flex shrink-0 flex-wrap items-center justify-between gap-[var(--space-2)]">
          <Button variant="outline" onClick={onReturn}>
            내 할 일로
          </Button>
          <h2 ref={titleRef} tabIndex={-1} className="text-lg font-semibold outline-none">
            친구
          </h2>
          <Button variant="outline" onClick={() => void useSocialStore.getState().refresh()}>
            새로고침
          </Button>
        </header>
        <div role="group" aria-label="친구 화면" className="flex flex-wrap gap-[var(--space-2)]">
          {(
            [
              { value: 'feed', label: '피드' },
              { value: 'friends', label: '친구 관리' },
              { value: 'mine', label: '내 공유' },
            ] as const
          ).map((entry) => (
            <Button
              key={entry.value}
              variant="outline"
              aria-pressed={tab === entry.value}
              onClick={() => chooseTab(entry.value)}
            >
              {entry.label}
            </Button>
          ))}
        </div>
        {mode === 'off' ? (
          <p role="status" className="text-sm text-muted">
            지금은 공유 기능을 사용할 수 없어요. 내 공유 기록은 확인하고 삭제할 수 있어요.
          </p>
        ) : null}
        {mode === 'read-only' ? (
          <p role="status" className="text-sm text-muted">
            지금은 기록을 읽을 수만 있어요. 내 공유 삭제와 공개 철회는 할 수 있어요.
          </p>
        ) : null}
        {phase === 'loading' && profile === null ? (
          <p role="status">친구 화면을 불러오는 중</p>
        ) : null}
        <SocialPendingCommands
          onOwnState={() => chooseTab('mine')}
          navigationKey={`${tab}:${view}:${pageIndex}:${cursor ?? ''}`}
          onResolved={async (operation, sameAccount) => {
            if (/^(delete|block|unblock|remove)-/.test(operation)) {
              invalidateSocialSession('revoked');
              await recheckSocialSession();
            }
            if (sameAccount()) await useSocialStore.getState().refreshCurrent();
          }}
        />
        {profile === null && phase === 'ready' ? (
          <SocialOnboarding
            enabled={mode === 'enabled'}
            onReady={() => void useSocialStore.getState().refresh()}
          />
        ) : null}
        {profile === null && phase === 'blocked' ? (
          <p role="status">
            친구 화면은 인터넷 연결이 필요해요. 로그인과 인터넷 연결을 확인해 주세요.
          </p>
        ) : null}
        {profile !== null ? (
          <div className="flex flex-wrap items-center justify-between gap-[var(--space-2)]">
            <p className="text-sm text-muted">친구에게 보이는 이름: {profile.nickname}</p>
            <SocialProfileSettings
              profile={profile}
              enabled={mode === 'enabled'}
              onChanged={() => void useSocialStore.getState().refresh()}
            />
          </div>
        ) : null}
        {profile !== null && invite ? (
          <InviteLanding
            enabled={mode === 'enabled'}
            onDone={() => {
              setInvite(false);
              chooseTab('friends');
            }}
          />
        ) : null}
        {profile !== null && tab === 'friends' ? (
          <SocialFriendsPanel
            enabled={mode === 'enabled'}
            onManageCategories={onManageCategories}
          />
        ) : null}
        {profile !== null && tab !== 'friends' ? (
          <SocialFeed
            mine={tab === 'mine'}
            onShare={() => setSharing(true)}
            onFriends={() => chooseTab('friends')}
          />
        ) : null}
        <p role="status" aria-live="polite">
          {notice}
        </p>
      </div>
      {sharing ? (
        <SocialShareDialog
          choices={choices}
          date={date}
          loading={choicesLoading}
          onDateChange={onDateChange}
          onClose={() => setSharing(false)}
          onShared={(id, audience) => {
            const allowed = captureSocialDispatch();
            setSharing(false);
            chooseTab('mine');
            setNotice(
              audience === 'recovered'
                ? '공유 사본을 확인했어요. 내 공유에서 현재 공개 범위를 확인해 주세요.'
                : audience === 'public'
                  ? '모두 공개로 공유했어요.'
                  : '친구에게 공유했어요.',
            );
            void useSocialStore
              .getState()
              .refresh()
              .then(() => {
                requestAnimationFrame(() => {
                  if (!aliveRef.current || !allowed()) return;
                  const card = document.getElementById(`social-post-${id}`);
                  (card ?? titleRef.current)?.focus();
                });
              });
          }}
        />
      ) : null}
    </main>
  );
}
