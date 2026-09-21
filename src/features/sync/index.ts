// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2).
//
// **진입 청크에 남는 전부**(T94_LAZY_BOUNDARY.md §C-6·§C-8). 여기서 지연 대상(엔진·auth-actions·
// reload-views·도메인 값)을 재export 하면 `lazy-boundary.test.ts` 가 즉시 빨개진다 — 배럴이
// 그것들을 정적으로 흡수하는 순간 진입 예산이 깨지기 때문이다(사실 4·5, 돌연변이 1).
export { AuthGate } from '@/features/sync/components/AuthGate';
export { AccountBlockLauncher } from '@/features/sync/components/AccountBlockLauncher';
export { AccountSyncOverlays } from '@/features/sync/components/AccountSyncOverlays';

export { useSyncStore } from '@/features/sync/store/sync-store';
export type {
  GatePhase,
  LoginNotice,
  SyncStore,
  SyncStoreState,
} from '@/features/sync/store/sync-store';
