// 백업 경고 점 (backup.md §2·R14).
//
// **닫기 버튼도 끄는 설정도 없다.** 이 컴포넌트에 `onClose` 류의 props 가 없는 것이 그 규칙의 표현이고,
// 사라지는 유일한 경로는 내보내기로 `lastBackupAt` 이 갱신되어 `warnStale` 이 거짓이 되는 것이다(R10).
// 근거: 데이터가 이 브라우저 안에만 있으므로 경고를 끄는 것은 위험을 지우는 게 아니라 숨기는 것이고,
// 끄는 행동이 백업보다 싸서는 안 된다. pwa R6 의 저장 공간 배너(1회성·✕ 로 닫힘)와는 다른 것이다.
import { cn } from '@/lib/cn';

type BackupWarningDotProps = { className?: string };

/** 점 자체는 장식이고 의미는 옆의 보조 문구가 전한다(색만으로 정보를 주지 않는다 — theme R9). */
export function BackupWarningDot({ className }: BackupWarningDotProps) {
  return (
    <span className={cn('inline-flex items-center', className)}>
      <span
        aria-hidden="true"
        className="block size-[6px] shrink-0 rounded-full bg-danger"
        data-testid="backup-warning-dot"
      />
      <span className="sr-only">백업한 지 오래됐어요</span>
    </span>
  );
}
