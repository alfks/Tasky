// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2). 명시 export 만 둔다.
//
// 앱 셸(T-15)이 쓰는 것은 `BackupLauncher` 하나다 — 버튼·경고 점·다이얼로그(지연 로드)·결과 토스트가
// 그 안에 들어 있다. 스토어는 다른 feature 가 "마지막 백업 시각" 을 읽어야 할 때를 위해 열어 둔다.
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
