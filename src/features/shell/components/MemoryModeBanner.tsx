'use client';

// 메모리 모드 상시 배너 (app-shell.md §2-C · §5 "메모리 모드 배너 role=alert 1회").
import { useBackupStore } from '@/features/backup';
import { MEMORY_MODE_BANNER_TEXT } from '@/features/shell/components/StorageFailureCard';

import { Button } from '@/components/ui/Button';

export function MemoryModeBanner() {
  const openDialog = useBackupStore((state) => state.openDialog);

  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-[var(--space-3)] border-b border-border bg-surface-2 px-[var(--space-4)] py-[var(--space-2)] text-base text-text"
    >
      <span>{MEMORY_MODE_BANNER_TEXT}</span>
      <Button variant="outline" size="sm" onClick={openDialog}>
        백업 내보내기
      </Button>
    </div>
  );
}
