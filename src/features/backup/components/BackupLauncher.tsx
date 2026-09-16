'use client';

// 사이드바 하단의 "⇅ 백업/복원" 진입점 (backup.md §2·R11·R12·R14).
//
// **결과 토스트는 전역 허브로 간다**(T-30). 여기에 뷰포트를 두면 `role="status"` 라이브 영역이 앱에
// 둘이 되고 R8 "동시에 1개" 도 이 컴포넌트 안에서만 참이 된다.
//
// **다이얼로그는 지연 로드한다.** 자주 열지 않는 화면이라 첫 로드 JS 예산(TECH_PLAN §8)에 상시로
// 실릴 이유가 없다 — 열 때 한 번 받아 오면 된다. 경고 점 판정에 필요한 것은 스토어뿐이라
// 버튼과 점은 지연 로드 대상이 아니다.
import { lazy, Suspense, useEffect, useRef } from 'react';

import { BackupWarningDot } from '@/features/backup/components/BackupWarningDot';
import { importResultMessage } from '@/features/backup/store/backup-state';
import { useBackupStore } from '@/features/backup/store/backup-store';

import { pushToast } from '@/components/ui/Toast';

const LazyBackupDialog = lazy(async () => {
  const loaded = await import('@/features/backup/components/BackupDialog');
  return { default: loaded.BackupDialog };
});

export function BackupLauncher() {
  const open = useBackupStore((state) => state.open);
  const warnStale = useBackupStore((state) => state.warnStale);
  const result = useBackupStore((state) => state.result);
  const openDialog = useBackupStore((state) => state.openDialog);
  const refreshWarning = useBackupStore((state) => state.refreshWarning);
  const dismissResult = useBackupStore((state) => state.dismissResult);

  // 파생 상태 동기화가 아니라 **외부 저장소 읽기**다(code-style §3 이 금지하는 쪽이 아니다).
  // 경고 점은 다이얼로그를 열지 않아도 보여야 하므로 마운트 시 한 번 읽는다 — 개수까지 읽지는 않는다.
  useEffect(() => {
    void refreshWarning();
  }, [refreshWarning]);

  /**
   * 가져오기 결과를 전역 허브에 한 번만 밀어 넣는다.
   *
   * 스토어의 `result` 는 사용자가 닫을 때까지 남는 값이고 허브의 토스트는 3초 뒤 스스로 사라지므로,
   * **띄운 뒤 곧바로 스토어를 비운다** — 그러지 않으면 다시 렌더될 때마다 같은 결과가 또 뜬다.
   * 스토어를 비우는 것이 곧 `dismissResult` 라 닫힘 처리도 여기서 끝난다.
   */
  const shown = useRef<unknown>(null);
  useEffect(() => {
    if (result === null) {
      shown.current = null;
      return;
    }
    if (shown.current === result) return;
    shown.current = result;
    pushToast({ message: importResultMessage(result) });
    dismissResult();
  }, [result, dismissResult]);

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
    </>
  );
}
