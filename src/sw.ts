// 읽기 조건: 서비스워커 동작(프리캐시·업데이트·오프라인)을 바꿀 때.
// 이 파일은 레이어에 속하지 않는 src/ 직속 진입점이다(scripts/arch-layers.mjs 의 SRC_ROOT_FILES).
// 빌드 산출물은 serwist.config.js 가 dist/client/sw.js 로 낸다 — vite.config.ts 에는 SW 설정이 없다.
//
// 오프라인 계약(specs/pwa.md R3, 실측 근거는 ADR-0013 §결과):
// - 프리캐시만 쓴다. `runtimeCaching` 도 `fallbacks` 도 두지 않는다 — R3 이 "데이터 요청이 없으므로
//   런타임 캐시 규칙은 없음" 이고, MVP 라우트는 `/` 하나뿐이다(app-shell.md §범위 밖).
// - 오프라인에서 `/` 가 뜨는 이유는 폴백이 아니라 프리캐시의 directoryIndex 다: 프리캐시 목록에
//   `index.html` 이 있고 Serwist 가 `/` 요청을 거기에 매칭한다. 그 항목이 있는지는 scripts/check-dist.mjs 가 본다.
// - 따라서 프리캐시 목록에 없는 문서 경로는 오프라인에서 그냥 실패한다(실측: `/settings` 오프라인 실패).
//   라우터가 없으므로(ADR-0013) 문서 경로는 `/` 하나다. Cloudflare 쪽 not_found_handling 이
//   미매칭 경로에 index.html 을 돌려주지만, **오프라인에서는 프리캐시 목록에 있는 것만 산다**.
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
});

serwist.addEventListeners();
