import { Button } from '@/components/ui/Button';

type SocialFeedEmptyProps = {
  pageIndex: number;
  onShowNew: () => void;
  onOpenFriends: () => void;
  onOpenMine: () => void;
};

export function SocialFeedEmpty({
  pageIndex,
  onShowNew,
  onOpenFriends,
  onOpenMine,
}: SocialFeedEmptyProps) {
  if (pageIndex > 0)
    return (
      <div className="flex flex-col items-start gap-[var(--space-2)]">
        <p>이 페이지에 표시할 기록이 없어요.</p>
        <Button variant="outline" onClick={onShowNew}>
          처음부터 다시 보기
        </Button>
      </div>
    );
  return (
    <div className="flex flex-col items-start gap-[var(--space-2)]">
      <p>아직 공유한 기록이 없어요.</p>
      <Button variant="outline" onClick={onOpenFriends}>
        친구 초대
      </Button>
      <Button variant="ghost" onClick={onOpenMine}>
        기록 공유
      </Button>
    </div>
  );
}
