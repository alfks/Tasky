'use client';

// 앱 수명주기에 PWA 배선을 묶는 단 하나의 지점 (specs/pwa.md R4~R8).
// 마운트는 `components/PwaNotices.tsx` 한 곳이다 — 두 번 마운트하면 서비스워커 리스너와
// 투두 구독이 겹친다.
import { useCallback, useEffect, useRef } from 'react';

import { usePwaStore, type PwaStore } from '@/features/pwa/store/pwa-store';
import {
  getServiceWorkerContainer,
  isProductionRuntime,
  watchServiceWorker,
  type ServiceWorkerEnv,
  type UpdateWatcher,
} from '@/features/pwa/store/service-worker';
import {
  getStorageEnv,
  readEstimate,
  readMemory,
  requestPersistence,
  writeMemory,
} from '@/features/pwa/store/storage';
import { useTodoStore } from '@/features/todo';

import { overlayLayerCount } from '@/components/ui/overlay-stack';

type Store = {
  getState: () => PwaStore;
};

/**
 * 이 탭을 **묻지 않고** 새로고침해도 되는가.
 * 화면에 보이지 않고(사용자가 보고 있지 않다) 열린 오버레이도 없을 때만 참이다 — 편집 패널이
 * 열린 채로 다른 탭이 업데이트를 적용했다고 입력 중인 내용을 날려 버리면 안 된다(R4 의 "미룬다").
 *
 * **이 분기는 실브라우저로 칠 수 없다.** 헤드리스 Chromium 은 `visibilityState` 를 `hidden` 으로
 * 만들 수단이 없다 — `page.bringToFront()`·`window.open` 으로 연 탭·CDP
 * `Page.setWebLifecycleState({state:'frozen'})`·`Emulation.setFocusEmulationEnabled(false)` 가
 * 전부 `visible` 그대로였고 `Emulation.setPageVisibilityOverride` 는 프로토콜에 없다(리뷰 R2).
 * 그래서 `usePwaLifecycle.test.tsx` 의 "조용한 새로고침 가드" 가 이 함수를 **직접** 부른다 —
 * 조건을 뒤집거나 오버레이 검사를 빼면 거기서 죽는다.
 */
function canReloadSilently(): boolean {
  return document.visibilityState === 'hidden' && overlayLayerCount() === 0;
}

/**
 * `watchServiceWorker` 에 넘기는 환경. **프로덕션이 실제로 쓰는 그 객체**를 테스트도 그대로
 * 받아 갈 수 있게 따로 뺐다 — 목으로 `canReloadSilently` 를 갈아 끼우면 위 가드가 한 번도
 * 실행되지 않은 채 초록불이 된다(대칭 픽스처).
 */
export function createServiceWorkerEnv(container: ServiceWorkerContainer): ServiceWorkerEnv {
  return {
    container,
    reload: () => window.location.reload(),
    canReloadSilently,
  };
}

/** 서비스워커 등록 + 업데이트 감시 (R4·R5). 개발 모드·미지원 브라우저에서는 아무것도 하지 않는다. */
function startServiceWorker(store: Store): UpdateWatcher | null {
  if (!isProductionRuntime()) return null;
  const container = getServiceWorkerContainer();
  if (container === null) return null;
  return watchServiceWorker(createServiceWorkerEnv(container), (stage) =>
    store.getState().setUpdateStage(stage),
  );
}

/** 앱 시작 시 1회: 기기별 기억 반영 + 용량 확인 (R6·R7). */
function startStorageProbe(store: Store): void {
  const env = getStorageEnv();
  store.getState().hydrateMemory(readMemory(env));
  void readEstimate(env).then((estimate) => store.getState().setEstimate(estimate));
}

/**
 * **첫 투두 저장 직후** 지속성을 1회 요청한다 (R6).
 *
 * 투두 스토어를 구독해 "적재가 아닌 쓰기" 만 골라낸다: 적재(`loadDate`)는 `status` 를 `loading`
 * 으로 떨어뜨렸다가 올리므로, `ready` → `ready` 이면서 `byId` 참조가 바뀐 전이가 곧 저장이다.
 * 기기별 기억(`persistAsked`)이 있으면 다시 묻지 않는다.
 */
function startPersistRequest(store: Store): () => void {
  const env = getStorageEnv();
  if (readMemory(env).persistAsked) return () => {};
  let asked = false;
  const ask = () => {
    if (asked) return;
    asked = true;
    void requestPersistence(env).then((persist) => {
      store.getState().setPersistState(persist);
      writeMemory(env, { persistAsked: true, noticeDismissed: false });
    });
  };
  return useTodoStore.subscribe((state, prev) => {
    if (state.status !== 'ready' || prev.status !== 'ready') return;
    if (state.byId === prev.byId) return;
    ask();
  });
}

/**
 * 탭 전환 배선 (R8 + R4 다중 탭).
 * - 다시 보이면 선택 날짜 목록을 재조회한다 — 다른 탭이 저장한 변경이 이 탭에 들어온다.
 * - 숨겨지면, 미뤄 둔 새 버전 적용을 조용히 끝낸다(사용자가 보고 있지 않을 때만).
 */
function startVisibility(watcher: UpdateWatcher | null): () => void {
  const handle = () => {
    if (document.visibilityState === 'visible') {
      const { date, loadDate } = useTodoStore.getState();
      if (date !== null) void loadDate(date);
      return;
    }
    watcher?.applySilentlyIfPending();
  };
  document.addEventListener('visibilitychange', handle);
  return () => document.removeEventListener('visibilitychange', handle);
}

export type PwaLifecycle = {
  /** 업데이트 토스트의 [새로고침]. */
  applyUpdate: () => void;
  /** 저장 공간 배너의 ✕. 상태와 기기별 기억을 함께 갱신한다 — 다시 뜨지 않는다(R6). */
  dismissStorageNotice: () => void;
};

/** 마운트 시 1회 배선한다. `PwaNotices` 만 부른다. */
export function usePwaLifecycle(): PwaLifecycle {
  const watcherRef = useRef<UpdateWatcher | null>(null);

  useEffect(() => {
    const watcher = startServiceWorker(usePwaStore);
    watcherRef.current = watcher;
    startStorageProbe(usePwaStore);
    const stopPersist = startPersistRequest(usePwaStore);
    const stopVisibility = startVisibility(watcher);
    return () => {
      stopVisibility();
      stopPersist();
      watcher?.stop();
      watcherRef.current = null;
    };
  }, []);

  const applyUpdate = useCallback(() => {
    watcherRef.current?.apply();
  }, []);

  const dismissStorageNotice = useCallback(() => {
    usePwaStore.getState().dismissStorageNotice();
    // 닫기는 "배너를 닫았다" 만 기록한다. 물었는지 여부는 요청 경로가 따로 남긴다 —
    // 여기서 `persistAsked: true` 를 덮어쓰면 아직 묻지 않은 기기에서 R6 요청이 통째로 건너뛰어진다.
    const env = getStorageEnv();
    writeMemory(env, { ...readMemory(env), noticeDismissed: true });
  }, []);

  return { applyUpdate, dismissStorageNotice };
}
