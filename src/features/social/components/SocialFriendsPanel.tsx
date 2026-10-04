import { SocialConnections } from '@/features/social/components/SocialConnections';
import { SocialInvites } from '@/features/social/components/SocialInvites';
import { SocialMyReactionsPanel } from '@/features/social/components/SocialMyReactionsPanel';
import { SocialRequests } from '@/features/social/components/SocialRequests';

import { Button } from '@/components/ui/Button';

type SocialFriendsPanelProps = {
  enabled: boolean;
  /** 보낸 응원은 off·read-only 모드에서도 조회·철회할 수 있어 `enabled`와 따로 받는다. */
  reactionsEnabled?: boolean;
  onManageCategories?: () => void;
};
export function SocialFriendsPanel({
  enabled,
  reactionsEnabled = false,
  onManageCategories,
}: SocialFriendsPanelProps) {
  return (
    <div className="flex flex-col gap-[var(--space-6)]">
      <Button
        variant="outline"
        disabled={onManageCategories === undefined}
        onClick={onManageCategories}
      >
        공유 카테고리 관리
      </Button>
      <SocialInvites enabled={enabled} />
      <SocialRequests direction="incoming" enabled={enabled} />
      <SocialRequests direction="outgoing" enabled={enabled} />
      <SocialConnections />
      <SocialConnections blocked />
      <SocialMyReactionsPanel enabled={reactionsEnabled} />
    </div>
  );
}
