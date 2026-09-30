import { SocialConnections } from '@/features/social/components/SocialConnections';
import { SocialInvites } from '@/features/social/components/SocialInvites';
import { SocialRequests } from '@/features/social/components/SocialRequests';

type SocialFriendsPanelProps = { enabled: boolean };
export function SocialFriendsPanel({ enabled }: SocialFriendsPanelProps) {
  return (
    <div className="flex flex-col gap-[var(--space-6)]">
      <SocialInvites enabled={enabled} />
      <SocialRequests direction="incoming" enabled={enabled} />
      <SocialRequests direction="outgoing" enabled={enabled} />
      <SocialConnections />
      <SocialConnections blocked />
    </div>
  );
}
