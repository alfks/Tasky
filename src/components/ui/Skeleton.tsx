import { cn } from '@/lib/cn';

type SkeletonProps = {
  /** 크기·모양은 사용처가 정한다(예: `h-[var(--space-5)] w-full`). */
  className?: string;
};

/**
 * 로딩 자리표시자. 내용이 없으므로 접근성 트리에서 감추고, 진행 중 상태는 사용처의
 * `aria-busy`/`aria-live` 가 알린다. 맥동은 `motion-safe` 로만 돈다(app-shell R13).
 */
export function Skeleton({ className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'block rounded-[var(--radius-sm)] bg-surface-2 motion-safe:animate-pulse',
        className,
      )}
    />
  );
}
