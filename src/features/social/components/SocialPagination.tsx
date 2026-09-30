import { Button } from '@/components/ui/Button';

type SocialPaginationProps = {
  pageIndex: number;
  nextCursor: string | null;
  busy: boolean;
  onNext: () => void;
  onPrevious: () => void;
};
export function SocialPagination({
  pageIndex,
  nextCursor,
  busy,
  onNext,
  onPrevious,
}: SocialPaginationProps) {
  return (
    <div className="flex flex-wrap gap-[var(--space-2)]">
      <Button variant="outline" disabled={busy || pageIndex === 0} onClick={onPrevious}>
        이전 기록
      </Button>
      <Button variant="outline" disabled={busy || nextCursor === null} onClick={onNext}>
        다음 기록 보기
      </Button>
    </div>
  );
}
