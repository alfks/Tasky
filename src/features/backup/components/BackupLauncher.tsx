'use client';

// 사이드바 하단의 "⇅ 백업/복원" 진입점 (backup.md §2·R11·R12·R14).
//
// **다이얼로그는 지연 로드한다.** 자주 열지 않는 화면이라 첫 로드 JS 예산(TECH_PLAN §8)에 상시로
// 실릴 이유가 없다 — 열 때 한 번 받아 오면 된다. 경고 점 판정에 필요한 것은 스토어뿐이라
// 버튼과 점은 지연 로드 대상이 아니다.
import { lazy, Suspense, useEffect } from 'react';

import { BackupWarningDot } from '@/features/backup/components/BackupWarningDot';
import { importResultMessage } from '@/features/backup/store/backup-state';
import { useBackupStore } from '@/features/backup/store/backup-store';

import { ToastViewport, type ToastItem } from '@/components/ui/Toast';

const LazyBackupDialog = lazy(async () => {
  const loaded = await import('@/features/backup/components/BackupDialog');
  return { default: loaded.BackupDialog };
});

/** 토스트가 없을 때의 고정 참조 — 매 렌더 새 배열을 주면 뷰포트가 불필요하게 다시 그려진다. */
const NO_TOASTS: readonly ToastItem[] = [];

export function BackupLauncher() {
  const open = useBackupStore((state) => state.open);
  const warnStale = useBackupStore((state) => state.warnStale);
  const result = useBackupStore((state) => state.result);
  const openDialog = useBackupStore((state) => state.openDialog);
  const refresh = useBackupStore((state) => state.refresh);
  const dismissResult = useBackupStore((state) => state.dismissResult);

  // 파생 상태 동기화가 아니라 **외부 저장소 읽기**다(code-style §3 이 금지하는 쪽이 아니다).
  // 경고 점은 다이얼로그를 열지 않아도 보여야 하므로 마운트 시 한 번 읽는다.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toasts =
    result === null
      ? NO_TOASTS
      : [{ id: 'backup-import-result', message: importResultMessage(result) }];

  return (
    <>
      <button
        type="button"
        onClick={openDialog}
        className="flex w-full items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-3)] py-[var(--space-2)] text-left text-sm text-text hover:bg-surface-2"
      >
        <span aria-hidden="true">⇅</span>
        <span>백업/복원</span>
        {warnStale ? <BackupWarningDot /> : null}
      </button>
      {open ? (
        <Suspense fallback={null}>
          <LazyBackupDialog />
        </Suspense>
      ) : null}
      <ToastViewport toasts={toasts} onClose={dismissResult} />
    </>
  );
}
