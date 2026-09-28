'use client';

import { useEffect } from 'react';

import { SocialInviteSection } from '@/features/social/components/SocialInviteSection';
import { SocialMyReactionsPanel } from '@/features/social/components/SocialMyReactionsPanel';
import { SocialProfileSection } from '@/features/social/components/SocialProfileSection';
import { SocialRelationLists } from '@/features/social/components/SocialRelationLists';
import { useSocialRelations } from '@/features/social/hooks/useSocialRelations';
import type { InviteBootstrap } from '@/features/social/lib/invite-bootstrap';

import { Button } from '@/components/ui/Button';

type SocialFriendsPanelProps = {
  invite: InviteBootstrap | null;
  onClearInvite: (expected: InviteBootstrap) => boolean;
  onGoFeed: () => void;
  refreshNonce: number;
  enabled: boolean;
};

export function SocialFriendsPanel({
  invite,
  onClearInvite,
  onGoFeed,
  refreshNonce,
  enabled,
}: SocialFriendsPanelProps) {
  const relations = useSocialRelations(enabled);
  const { data, phase, error, load } = relations;

  useEffect(() => {
    if (enabled && refreshNonce > 0) void load();
  }, [enabled, refreshNonce, load]);

  if (phase === 'loading' || phase === 'idle')
    return <p role="status">친구 관계를 불러오는 중이에요.</p>;
  if (phase === 'error')
    return (
      <div role="alert" className="flex flex-col items-start gap-[var(--space-2)]">
        <p>{error ?? '불러오지 못했어요.'}</p>
        <Button onClick={() => void load()}>다시 시도</Button>
      </div>
    );

  return (
    <div className="flex flex-col gap-[var(--space-5)]">
      {error ? (
        <div role="alert" className="flex flex-wrap items-center gap-[var(--space-2)] text-danger">
          <p>{error}</p>
          <Button variant="outline" onClick={() => void load()}>
            목록 다시 확인
          </Button>
        </div>
      ) : null}
      {data.me?.mode !== 'enabled' ? (
        <p role="status" className="text-sm text-muted">
          {data.me?.mode === 'off'
            ? '지금은 새 친구 요청과 공유를 사용할 수 없어요. 기존 관계와 철회는 관리할 수 있어요.'
            : '지금은 새 친구 요청을 보낼 수 없어요. 기존 관계와 철회는 관리할 수 있어요.'}
        </p>
      ) : null}
      <SocialProfileSection relations={relations} />
      <SocialInviteSection relations={relations} invite={invite} onClearInvite={onClearInvite} />
      {data.me?.profile ? <SocialRelationLists relations={relations} onGoFeed={onGoFeed} /> : null}
      {data.me?.profile ? (
        <SocialMyReactionsPanel enabled={enabled} refreshNonce={refreshNonce} />
      ) : null}
    </div>
  );
}
