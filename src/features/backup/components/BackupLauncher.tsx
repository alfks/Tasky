'use client';

// 사이드바 하단의 "⇅ 백업/복원" 진입점 (backup.md §2·R11·R12·R14).
//
// **토스트 뷰포트 소유권은 임시다** — 앱 셸(T-15)이 상주 뷰포트를 두면 `role="status"` 라이브 영역이
// 둘이 된다. 그때 이 뷰포트를 지우고 셸의 것에 결과 토스트를 넘긴다(리뷰 라운드 1 Minor-7).
//
// **다이얼로그는 지연 로드한다.** 자주 열지 않는 화면이라 첫 로드 JS 예산(TECH_PLAN §8)에 상시로
// 실릴 이유가 없다 — 열 때 한 번 받아 오면 된다. 경고 점 판정에 필요한 것은 스토어뿐이라
// 버튼과 점은 지연 로드 대상이 아니다.
import { lazy, Suspense, useEffect, useState } from 'react';

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
  const refreshWarning = useBackupStore((state) => state.refreshWarning);
  const dismissResult = useBackupStore((state) => state.dismissResult);

  /**
   * 토스트 뷰포트는 **마운트 이후에만** 띄운다 — 첫 렌더는 서버가 그릴 수 있는 것만 낸다.
   *
   * `ToastViewport` 는 `document` 가 없으면 `null` 이라 서버 렌더 결과에 없다. 그것을 첫 렌더에 그대로
   * 두면 서버 HTML 과 클라이언트 트리가 달라 React 19 가 트리를 통째로 다시 만든다 — 리뷰 라운드 1
   * Major-1 이 실 Chromium 에서 잡은 PAGEERROR 가 그것이다.
   *
   * **지금 스택에는 서버 렌더가 없다**(ADR-0013 이 순수 Vite SPA 로 되돌렸다). 그러니 이 가드는 오늘의
   * 버그를 막는 게 아니라 프리렌더가 돌아올 때를 위한 보험이고, 값은 마운트 때 렌더 한 번이다.
   * `BackupLauncher.test.tsx` 가 `renderToString` → `hydrateRoot` 로 그 성질을 고정한다.
   *
   * `toasts` 가 빌 때 아예 렌더하지 않는 방법도 있지만, 그러면 라이브 영역과 문구가 같은 순간에 삽입되어
   * 상당수 스크린리더가 읽지 않는다(`Toast.tsx` 주석). 그래서 **비어 있는 뷰포트를 먼저 띄워 둔다**.
   */
  const [mounted, setMounted] = useState(false);

  // 파생 상태 동기화가 아니라 **외부 저장소 읽기**다(code-style §3 이 금지하는 쪽이 아니다).
  // 경고 점은 다이얼로그를 열지 않아도 보여야 하므로 마운트 시 한 번 읽는다 — 개수까지 읽지는 않는다.
  useEffect(() => {
    setMounted(true);
    void refreshWarning();
  }, [refreshWarning]);

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
      {mounted ? <ToastViewport toasts={toasts} onClose={dismissResult} /> : null}
    </>
  );
}
