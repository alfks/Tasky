'use client';

// 계정 관련 오버레이 셋(R7 업로드 다이얼로그 · 계정 삭제 안내 · 계정 전환 안내) + `exportBackup`
// 등록 — **레이아웃과 무관하게 항상 마운트된다** (리뷰 Major 3).
//
// `AccountBlockLauncher`(사이드바) 안에 있던 시절엔 사이드바가 컬럼일 때, 또는 드로어를 연 동안만
// 마운트됐다 — 좁은 뷰포트(<1024px, `layout.ts` narrow/compact)에서 드로어를 한 번도 연 적 없는
// 세션은 이 셋 중 아무것도 못 보고 `registerExportBackup` 도 불리지 않는다. 그 상태에서 첫 로그인
// 이 끝나면 R7 다이얼로그가 없으니 `completeLogin` 도 엔진을 안 켜고, 사용자가 그 다이얼로그를 볼
// 방법이 없으니 `resolveUpload`/`deferUpload` 도 못 불려 엔진은 그 세션 내내 시작되지 않는다
// (실측). 그래서 셸의 조립 지점(`ShellOverlays`)이 레이아웃 분기 밖에서 이 컴포넌트 하나를 문다.
import { useEffect } from 'react';

import { AccountDeletedNotice } from '@/features/sync/components/AccountDeletedNotice';
import { AccountSwitchedNotice } from '@/features/sync/components/AccountSwitchedNotice';
import { UploadDialog } from '@/features/sync/components/UploadDialog';
import { registerExportBackup, useSyncStore } from '@/features/sync/store/sync-store';

type AccountSyncOverlaysProps = {
  exportBackup: () => Promise<boolean>;
};

export function AccountSyncOverlays({ exportBackup }: AccountSyncOverlaysProps) {
  const uploadPrompt = useSyncStore((state) => state.uploadPrompt);
  const accountDeletedNotice = useSyncStore((state) => state.accountDeletedNotice);
  const accountSwitchedNotice = useSyncStore((state) => state.accountSwitchedNotice);

  // 계정 전환처럼 사용자 상호작용 없이 자동으로 일어나던 내보내기가 쓰던 통로다. 지금은 전환도
  // 다이얼로그를 거치므로(위 머리주석, Major 2) 직접 읽는 곳은 없지만, 등록은 유지한다 — 다른
  // 지연 코드가 언젠가 배경 내보내기가 필요해지면 다시 꺼내 쓸 자리다.
  useEffect(() => {
    registerExportBackup(exportBackup);
    return () => registerExportBackup(null);
  }, [exportBackup]);

  return (
    <>
      {uploadPrompt ? <UploadDialog exportBackup={exportBackup} /> : null}
      {accountDeletedNotice ? <AccountDeletedNotice exportBackup={exportBackup} /> : null}
      {accountSwitchedNotice ? <AccountSwitchedNotice exportBackup={exportBackup} /> : null}
    </>
  );
}
