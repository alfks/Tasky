'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { SocialFeedPanel } from '@/features/social/components/SocialFeedPanel';
import { SocialFriendsPanel } from '@/features/social/components/SocialFriendsPanel';
import { SocialMyPostsPanel } from '@/features/social/components/SocialMyPostsPanel';
import type { InviteBootstrap } from '@/features/social/lib/invite-bootstrap';
import { captureSocialDispatch } from '@/features/social/session-lifecycle';
import { useSocialStore } from '@/features/social/store/social-store';

import { Button } from '@/components/ui/Button';

const TABS = [
  { id: 'feed', label: '피드' },
  { id: 'friends', label: '친구 관리' },
  { id: 'mine', label: '내 공유' },
] as const;
type TabId = (typeof TABS)[number]['id'];

export type SocialScreenProps = {
  invite: InviteBootstrap | null;
  onClearInvite: (expected: InviteBootstrap) => boolean;
  initialDate: DateKey;
  onDraftDirtyChange: (dirty: boolean) => void;
};

/** 친구 화면 본문은 청크가 열린 뒤에만 마운트된다. */
export function SocialScreen({
  invite,
  onClearInvite,
  initialDate,
  onDraftDirtyChange,
}: SocialScreenProps) {
  const [tab, setTab] = useState<TabId>(invite === null ? 'feed' : 'friends');
  const [focusedTab, setFocusedTab] = useState<TabId>(tab);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const tabsRef = useRef<Record<TabId, HTMLButtonElement | null>>({
    feed: null,
    friends: null,
    mine: null,
  });
  const phase = useSocialStore((state) => state.phase);
  const open = useSocialStore((state) => state.open);
  const close = useSocialStore((state) => state.close);
  const refresh = useSocialStore((state) => state.refresh);

  useEffect(() => {
    void open();
    return () => close();
  }, [open, close]);

  useEffect(() => {
    if (invite === null) return;
    setTab('friends');
    setFocusedTab('friends');
    const valid = captureSocialDispatch();
    const handle = requestAnimationFrame(() => {
      const target = tabsRef.current.friends;
      if (valid() && target?.isConnected && target.getAttribute('aria-selected') === 'true')
        target.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(handle);
  }, [invite]);

  const moveTab = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const destination = TABS[index]?.id;
    if (destination === undefined) return;
    event.preventDefault();
    setFocusedTab(destination);
    tabsRef.current[destination]?.focus();
  };

  return (
    <>
      <div
        role="tablist"
        aria-label="친구 화면"
        className="flex gap-[var(--space-2)] overflow-x-auto"
      >
        {TABS.map((item, index) => (
          <button
            key={item.id}
            ref={(element) => {
              tabsRef.current[item.id] = element;
            }}
            type="button"
            role="tab"
            id={`social-tab-${item.id}`}
            aria-controls={`social-panel-${item.id}`}
            aria-selected={tab === item.id}
            tabIndex={focusedTab === item.id ? 0 : -1}
            onFocus={() => setFocusedTab(item.id)}
            onClick={() => setTab(item.id)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowRight') moveTab(event, (index + 1) % TABS.length);
              else if (event.key === 'ArrowLeft')
                moveTab(event, (index + TABS.length - 1) % TABS.length);
              else if (event.key === 'Home') moveTab(event, 0);
              else if (event.key === 'End') moveTab(event, TABS.length - 1);
              else if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setTab(item.id);
              }
            }}
            className="shrink-0 rounded-[var(--radius-md)] px-[var(--space-3)] py-[var(--space-2)] text-sm focus-visible:outline-2 focus-visible:outline-focus aria-selected:bg-accent aria-selected:text-on-accent"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex justify-end">
        <Button
          variant="outline"
          onClick={() => {
            if (tab === 'feed') void refresh();
            else setRefreshNonce((value) => value + 1);
          }}
        >
          새로고침
        </Button>
      </div>
      {phase === 'blocked' && tab !== 'feed' ? (
        <p role="status">친구 화면은 인터넷 연결과 로그인이 필요해요.</p>
      ) : null}
      {TABS.map((item) => (
        <section
          key={item.id}
          id={`social-panel-${item.id}`}
          role="tabpanel"
          aria-labelledby={`social-tab-${item.id}`}
          hidden={tab !== item.id || (phase === 'blocked' && item.id !== 'feed')}
          className="min-h-0 flex-1 overflow-y-auto py-[var(--space-4)]"
        >
          {tab === item.id ? (
            item.id === 'feed' ? (
              <SocialFeedPanel
                onOpenFriends={() => {
                  setTab('friends');
                  tabsRef.current.friends?.focus({ preventScroll: true });
                }}
                onOpenMine={() => {
                  setTab('mine');
                  tabsRef.current.mine?.focus({ preventScroll: true });
                }}
              />
            ) : item.id === 'friends' ? (
              <SocialFriendsPanel
                invite={invite}
                onClearInvite={onClearInvite}
                onGoFeed={() => setTab('feed')}
                refreshNonce={refreshNonce}
                enabled={phase !== 'blocked'}
              />
            ) : (
              <SocialMyPostsPanel
                initialDate={initialDate}
                refreshNonce={refreshNonce}
                onDirtyChange={onDraftDirtyChange}
                enabled={phase !== 'blocked'}
              />
            )
          ) : null}
        </section>
      ))}
    </>
  );
}
