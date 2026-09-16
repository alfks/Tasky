// 백업/복원 스토어 (backup.md). 이 파일은 **조립만** 한다 — 상태 모양과 순수 변환은 `backup-state.ts`,
// 액션은 `backup-actions.ts`, 브라우저 파일 입출력은 `browser-file.ts` 다.
import { create } from 'zustand';

import {
  browserBackupIo,
  createBackupActions,
  type BackupActions,
  type BackupDeps,
  type BackupIo,
} from '@/features/backup/store/backup-actions';
import { initialBackupState, type BackupState } from '@/features/backup/store/backup-state';

import { nowIso, todayKey } from '@/lib/date';
import { newId } from '@/lib/id';

export type { BackupActions };

/** 상태 + 액션. 컴포넌트는 selector 로 필요한 조각만 구독한다. */
export type BackupStore = BackupState & BackupActions;

/** 실제 시계·UUID·로컬 날짜. 테스트는 고정 주입기를 쓴다. */
const defaultDeps: BackupDeps = { now: nowIso, id: newId, today: todayKey };

/**
 * 스토어 팩토리. 앱은 아래 `useBackupStore` 하나만 쓰고(code-style §4: feature 당 스토어 1개),
 * 테스트가 결정적인 `deps`·대역 `io` 로 격리된 인스턴스를 만들 수 있도록 팩토리를 열어 둔다.
 */
export function createBackupStore(deps: BackupDeps = defaultDeps, io: BackupIo = browserBackupIo) {
  return create<BackupStore>()((set, get) => ({
    ...initialBackupState,
    ...createBackupActions({ set, get, deps, io }),
  }));
}

/** 앱이 쓰는 단 하나의 백업 스토어. */
export const useBackupStore = createBackupStore();
