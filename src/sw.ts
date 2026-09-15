// 읽기 조건: 서비스워커 동작(프리캐시·업데이트·오프라인 폴백)을 바꿀 때.
// 이 파일은 레이어에 속하지 않는 src/ 직속 진입점이다(scripts/arch-layers.mjs 의 SRC_ROOT_FILES).
// 빌드 산출물은 serwist.config.js 가 dist/client/sw.js 로 낸다 — next.config.ts 에는 SW 설정이 없다.
import { Serwist } from 'serwist';

import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist';

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined;
  }
}

declare const self: ServiceWorkerGlobalScope;

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  // specs/pwa.md R4 — 사용자가 토스트의 [새로고침] 을 누를 때까지 교체하지 않는다.
  skipWaiting: false,
  clientsClaim: true,
  navigationPreload: false,
  precacheOptions: { cleanupOutdatedCaches: true },
  fallbacks: {
    entries: [{ url: '/index.html', matcher: ({ request }) => request.destination === 'document' }],
  },
});

serwist.addEventListeners();
