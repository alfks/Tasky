import { SocialConnections } from '@/features/social/components/SocialConnections';
import { SocialInvites } from '@/features/social/components/SocialInvites';
import { SocialRequests } from '@/features/social/components/SocialRequests';

import { Button } from '@/components/ui/Button';

type SocialFriendsPanelProps = { enabled: boolean; onManageCategories?: () => void };
export function SocialFriendsPanel({ enabled, onManageCategories }: SocialFriendsPanelProps) {
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
    </div>
  );
}
