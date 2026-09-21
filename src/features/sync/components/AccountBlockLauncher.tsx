'use client';

// 사이드바 맨 끝 진입점(sync.md §2, app-shell.md R12-a). `exportBackup` 은 `AppShell` 이
// `useBackupStore` 에서 꺼내 prop 으로 내려준다 — `sync` 는 `backup` 을 import 할 수 없다(§D-10).
//
// **다이얼로그·`registerExportBackup` 는 여기 없다** (리뷰 Major 3). 이 컴포넌트는 사이드바가
// 컬럼일 때, 또는 드로어를 연 동안만 마운트된다 — 좁은 뷰포트(<1024px)에서 드로어를 한 번도
// 연 적 없는 세션에는 마운트되지 않으므로, R7 업로드 다이얼로그·계정 삭제 안내·전환 안내가
// 그 세션 내내 뜨지 않고 `registerExportBackup` 도 불리지 않아 엔진이 시작되지 않는다(실측).
// 그 셋은 레이아웃과 무관하게 항상 마운트돼야 해서 `AccountSyncOverlays`(→ `ShellOverlays`)로
// 옮겼다 — 계정 블록 **UI** 자체(이 컴포넌트)는 사이드바에 남는다.
import { AccountBlock } from '@/features/sync/components/AccountBlock';

type AccountBlockLauncherProps = {
  exportBackup: () => Promise<boolean>;
};

export function AccountBlockLauncher({ exportBackup }: AccountBlockLauncherProps) {
  return <AccountBlock exportBackup={exportBackup} />;
}
