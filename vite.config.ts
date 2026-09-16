// 읽기 조건: 빌드 파이프라인(순수 Vite + React SPA · Cloudflare Workers 정적 자산)을 바꿀 때.
// 라우터는 넣지 않는다 — 라우트가 `/` 하나뿐이라 진입점이 곧 화면이다(ADR-0013).
// 서비스워커 설정은 여기가 아니라 serwist.config.js 에 있다(ADR-0013 규칙 3).
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

const src = fileURLToPath(new URL('./src', import.meta.url));

/**
 * 동적 import 청크(= Dexie + infra)를 <head> 의 modulepreload 로 알린다.
 *
 * 없으면 브라우저는 "진입 청크를 받아 실행한 뒤에야" 그 청크를 발견하므로 왕복이 직렬로 쌓인다
 * (실측: Fast 3G 상당에서 첫 콘텐츠가 정적 import 판보다 85ms 늦었다). 이 링크가 있으면 두 청크를
 * **동시에** 받으면서도 Dexie 는 진입 청크의 파싱·실행 경로 밖에 남는다 — 지연 로드의 이득만 남는다.
 */
function preloadAsyncChunks(): Plugin {
  return {
    name: 'tasky:preload-async-chunks',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        if (ctx.bundle === undefined) return [];
        return Object.values(ctx.bundle)
          .filter((c) => c.type === 'chunk' && c.isDynamicEntry)
          .map((c) => ({
            tag: 'link',
            attrs: { rel: 'modulepreload', crossorigin: '', href: `/${c.fileName}` },
            injectTo: 'head' as const,
          }));
      },
    },
  };
}

const config = defineConfig({
  plugins: [react(), preloadAsyncChunks()],
  // tsconfig.json 의 paths 와 한 쌍이다(vitest.config.ts 도 같은 별칭을 따로 건다).
  resolve: { alias: { '@': src } },
  build: {
    // dist/client 를 유지한다: serwist.config.js 의 globDirectory, scripts/deploy.sh 의 산출물 검사,
    // wrangler.jsonc 의 assets.directory, 배포 워크플로가 모두 이 경로를 가리킨다.
    outDir: 'dist/client',
    emptyOutDir: true,
    // public/_headers 의 immutable 규칙이 이 디렉토리 이름과 한 쌍이다 — 바꾸면 그 파일도 같이 바꾼다.
    assetsDir: 'assets',
  },
});

export default config;
