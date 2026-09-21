'use client';

// 사이드바 맨 끝 진입점(sync.md §2, app-shell.md R12-a). `exportBackup` 은 `ShellSidebar` 가
// `useBackupStore` 에서 꺼내 prop 으로 내려준다 — `sync` 는 `backup` 을 import 할 수 없다(§D-10).
import { useEffect } from 'react';

import { AccountBlock } from '@/features/sync/components/AccountBlock';
import { UploadDialog } from '@/features/sync/components/UploadDialog';
import { registerExportBackup, useSyncStore } from '@/features/sync/store/sync-store';

type AccountBlockLauncherProps = {
  exportBackup: () => Promise<boolean>;
};

export function AccountBlockLauncher({ exportBackup }: AccountBlockLauncherProps) {
  const uploadPrompt = useSyncStore((state) => state.uploadPrompt);

  // 계정 전환(§D-9 "sub ≠ userSub")처럼 사용자 상호작용 없이 자동으로 일어나는 내보내기가
  // 필요할 때 엔진(지연)이 이 콜백을 쓴다 — 마운트된 동안만 유효하다.
  useEffect(() => {
    registerExportBackup(exportBackup);
    return () => registerExportBackup(null);
  }, [exportBackup]);

  return (
    <>
      <AccountBlock exportBackup={exportBackup} />
      {uploadPrompt ? <UploadDialog exportBackup={exportBackup} /> : null}
    </>
  );
}
