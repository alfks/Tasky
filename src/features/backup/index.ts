// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2). 명시 export 만 둔다.
//
// 앱 셸(T-15)이 쓰는 것은 `BackupLauncher` 하나다 — 버튼·경고 점·다이얼로그(지연 로드)·결과 토스트가
// 그 안에 들어 있다. 스토어는 다른 feature 가 "마지막 백업 시각" 을 읽어야 할 때를 위해 열어 둔다.
//
// **가져오기 후 다시 조회해야 하는 feature 는 `dataRevision` 을 본다** (R11) — 가져오기가 성공할
// 때마다 +1 이고, 그 외에는 변하지 않는다. 다만 **어떻게 보느냐가 feature 마다 다르다.**
//
// - 이 배럴을 import 해도 순환이 생기지 않는 feature 라면 직접 구독한다:
//   `const revision = useBackupStore((state) => state.dataRevision)` 를 조회 `useEffect` 의 의존성에 더한다.
// - **그렇지 않은 feature 가 있다.** 이 배럴은 `BackupLauncher` 를 내보내고 그 가지가
//   `command` → `date-strip` 까지 닿는다. 그 가지에 걸린 feature — 특히 **다른 feature 들이 import 하는
//   리프** — 가 여기를 되짚으면 `import/no-cycle` 이 막는다. 다른 feature 는 배럴로만 import 할 수 있어
//   (code-style.md §2, 표 5) 내부 경로로 우회할 수도 없다.
//
// 막히는 쪽은 **셸이 합성해서 prop 으로 내려보낸다** — 셸은 최상위 합성자라 이미 양쪽 화살표를 갖고
// 있어서 새 import 간선이 0개다. 실물 그대로 따라 쓰면 된다(절차를 여기 옮겨 적지 않는다):
// `src/features/shell/components/ShellHeader.tsx` 의 `useSummaryRevision()` 과
// 그 값을 받는 `src/features/date-strip/hooks/useWeekSummaries.ts` 의 `revision` 인자 (T-56).
export { BackupLauncher } from '@/features/backup/components/BackupLauncher';
export { BackupWarningDot } from '@/features/backup/components/BackupWarningDot';

export { createBackupStore, useBackupStore } from '@/features/backup/store/backup-store';
export type { BackupActions, BackupStore } from '@/features/backup/store/backup-store';
export type { BackupDeps, BackupIo } from '@/features/backup/store/backup-actions';
export {
  importResultMessage,
  type BackupPhase,
  type BackupSelection,
  type BackupState,
} from '@/features/backup/store/backup-state';
