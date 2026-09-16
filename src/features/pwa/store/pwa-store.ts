// PWA 스토어 (specs/pwa.md R4·R6·R7). 상태 모양과 판정은 `pwa-state.ts`, 브라우저 배선은
// `service-worker.ts`·`storage.ts`, 그 둘을 앱 수명주기에 묶는 것은 `hooks/usePwaLifecycle.ts` 다.
// 이 파일은 **조립만** 한다 — 여기에 브라우저 API 를 부르면 프리렌더(서버)에서 터진다.
import { create } from 'zustand';

import {
  isQuotaTight,
  needsStorageNotice,
  type PersistState,
  type PwaMemory,
  type StorageEstimate,
  type UpdateStage,
} from '@/features/pwa/store/pwa-state';

export type PwaState = {
  /** 새 서비스워커의 단계 (R4). */
  update: UpdateStage;
  /** 사용자가 업데이트 토스트를 ✕ 로 닫았는가. 단계가 바뀌면 다시 뜬다. */
  isUpdateDismissed: boolean;
  /** `persist()` 결과 (R6). 요청 전에는 `unknown`. */
  persist: PersistState;
  /** 앱 시작 시 1회 읽은 사용량 (R7). 못 읽었으면 `null`. */
  estimate: StorageEstimate;
  /** 지속성 배너를 이 기기에서 이미 닫았는가 (R6 — 1회성). */
  isStorageNoticeDismissed: boolean;
};

export type PwaActions = {
  setUpdateStage: (stage: UpdateStage) => void;
  dismissUpdate: () => void;
  setPersistState: (persist: PersistState) => void;
  setEstimate: (estimate: StorageEstimate) => void;
  dismissStorageNotice: () => void;
  /** 기기별 기억(localStorage)을 상태에 반영한다. 앱 시작 시 1회. */
  hydrateMemory: (memory: PwaMemory) => void;
};

export type PwaStore = PwaState & PwaActions;

const initialState: PwaState = {
  update: 'idle',
  isUpdateDismissed: false,
  persist: 'unknown',
  estimate: null,
  isStorageNoticeDismissed: false,
};

/** 테스트가 격리된 인스턴스를 만들 수 있도록 팩토리를 열어 둔다(todo 스토어와 같은 모양). */
export function createPwaStore() {
  return create<PwaStore>()((set) => ({
    ...initialState,
    // 단계가 바뀌면 닫음을 푼다 — '대기' 토스트를 닫은 뒤 다른 탭이 적용해 버전이 갈린 상황은
    // 같은 알림이 아니라 **새 알림**이다.
    setUpdateStage: (update) => set({ update, isUpdateDismissed: false }),
    dismissUpdate: () => set({ isUpdateDismissed: true }),
    setPersistState: (persist) => set({ persist }),
    setEstimate: (estimate) => set({ estimate }),
    dismissStorageNotice: () => set({ isStorageNoticeDismissed: true }),
    hydrateMemory: (memory) => set({ isStorageNoticeDismissed: memory.noticeDismissed }),
  }));
}

/** 앱이 쓰는 단 하나의 PWA 스토어. */
export const usePwaStore = createPwaStore();

/** 업데이트 토스트를 띄울 때인가 (R4). 미룰지 여부(편집 중)는 컴포넌트가 따로 본다. */
export function selectIsUpdateReady(state: PwaState): boolean {
  return state.update !== 'idle' && !state.isUpdateDismissed;
}

/** 지속성 배너를 띄울 때인가 (R6). */
export function selectIsStorageNoticeOpen(state: PwaState): boolean {
  return needsStorageNotice(state.persist) && !state.isStorageNoticeDismissed;
}

/** 용량 경고를 띄울 때인가 (R7). 백업 다이얼로그가 이 값과 `STORAGE_TIGHT_TEXT` 를 쓴다. */
export function selectIsStorageTight(state: PwaState): boolean {
  return isQuotaTight(state.estimate);
}
