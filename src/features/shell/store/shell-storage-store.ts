// 저장소 열기 실패와 메모리 모드 (app-shell.md §2-C "에러(저장소 열기 실패)" · §4).
//
// 실패 판정은 **카테고리 적재**로 한다. 앱이 저장소에 처음 말을 거는 곳이 거기고(사이드바 목록),
// Dexie 가 DB 를 여는 것도 그 첫 조회 때다(ADR-0013: 생성자는 `indexedDB` 를 건드리지 않는다).
// 즉 "카테고리를 못 읽었다" 가 곧 "저장 공간을 열 수 없다" 다 — 사생활 보호 모드가 그 경로다.
//
// 메모리 구현은 **정적 import** 다. 지연 로드가 예산상 더 싸 보이지만(gzip 1.6 kB), 이 코드가 필요한
// 순간은 저장 공간이 막힌 순간 — 오프라인·프리캐시 미스가 겹치기 쉬운 상황이다. 그때 청크를 받아
// 오지 못하면 대체 경로 자체가 사라진다. 또 memory 구현과 infra 구현이 `@/repositories/ordering` 을
// 함께 쓰는데, 둘 다 동적이면 어느 쪽 진입점에도 속하지 않는 공유 청크가 생겨 `<head>` 의
// modulepreload 에 실리지 못한다(`scripts/check-dist.mjs` 가 그걸 문다).
import { create } from 'zustand';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

/**
 * - `storage` — 정상. 저장소가 살아 있다.
 * - `failed`  — 열지 못했다. 메인이 안내 카드로 바뀐다.
 * - `memory`  — 사용자가 `[메모리 모드로 계속]` 을 골랐다. 상단 배너가 상시로 뜬다.
 */
export type ShellStorageStatus = 'storage' | 'failed' | 'memory';

export type ShellStorageState = {
  status: ShellStorageStatus;
  /** 저장소 열기에 실패했다. 이미 메모리 모드면 무시한다 — 되돌아갈 곳이 없다. */
  reportFailure: () => void;
  /**
   * 메모리 구현으로 갈아끼운다. **동기다** — `createMemoryRepositories()` 는 I/O 를 하지 않는다.
   * 한때 `async` 로 두었더니 `await` 할 것이 없어 절대 실패하지 않는 Promise 가 되었고, 그것을
   * 기다리는 화면의 `loading` 표시가 장식으로 남았다(리뷰 Minor).
   */
  continueInMemory: () => void;
};

export const useShellStorageStore = create<ShellStorageState>((set, get) => ({
  status: 'storage',
  reportFailure: () => {
    if (get().status === 'memory') return;
    set({ status: 'failed' });
  },
  continueInMemory: () => {
    setRepositories(createMemoryRepositories());
    set({ status: 'memory' });
  },
}));
