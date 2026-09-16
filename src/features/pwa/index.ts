// 공개 API 배럴 (specs/pwa.md R4·R6~R8). 앱 셸은 `PwaNotices` 하나만 마운트하면 된다 —
// 서비스워커 등록·지속성 요청·용량 확인·탭 전환 재조회가 전부 그 안에 배선돼 있다.
export { PwaNotices } from '@/features/pwa/components/PwaNotices';

// 백업 화면(R7)이 쓸 조각: 사용률이 80% 를 넘으면 다이얼로그 상단에 이 문구를 붙인다.
export { STORAGE_TIGHT_TEXT } from '@/features/pwa/store/pwa-state';
export type { PersistState, StorageEstimate, UpdateStage } from '@/features/pwa/store/pwa-state';
export { selectIsStorageTight, usePwaStore } from '@/features/pwa/store/pwa-store';
export type { PwaState, PwaStore } from '@/features/pwa/store/pwa-store';
