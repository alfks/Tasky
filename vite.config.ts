// 읽기 조건: 빌드 파이프라인(순수 Vite + React SPA · Cloudflare Workers 정적 자산)을 바꿀 때.
// 라우터는 넣지 않는다 — 라우트가 `/` 하나뿐이라 진입점이 곧 화면이다(ADR-0013).
// 서비스워커 설정은 여기가 아니라 serwist.config.js 에 있다(ADR-0013 규칙 3).
import { fileURLToPath } from 'node:url';

import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';

import {
  chunkGraph,
  classifyGraph,
  bundleGroup,
  inspectBundleGroups,
} from './scripts/bundle-graph.mjs';

const src = fileURLToPath(new URL('./src', import.meta.url));

/** 기존 개인 preload는 유지하고, 명시한 새 online 소셜 진입 그래프만 지연한다(ADR-0025). */
function preloadAsyncChunks(): Plugin {
  return {
    name: 'tasky:preload-async-chunks',
    generateBundle(_options, bundle) {
      const errors = inspectBundleGroups(chunkGraph(bundle));
      if (errors.length > 0) this.error(errors.join('\n'));
      this.emitFile({
        type: 'asset',
        fileName: 'bundle-graph.json',
        source: JSON.stringify(chunkGraph(bundle)),
      });
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.bundle === undefined) return [];
        const { required } = classifyGraph(chunkGraph(ctx.bundle));
        return Object.values(ctx.bundle)
          .filter(
            (c) =>
              c.type === 'chunk' &&
              required.has(c.fileName) &&
              !c.isEntry &&
              !html.includes(c.fileName),
          )
          .map((c) => ({
            tag: 'link',
            attrs: { rel: 'modulepreload', crossorigin: '', href: `/${c.fileName}` },
            injectTo: 'head' as const,
          }));
      },
    },
  };
}

/**
 * 산출물 HTML 에서만 주석을 걷어낸다(소스 `index.html` 의 14줄짜리 설명 주석이 그대로 실려 나갔다).
 *
 * 걷어낸 뒤에도 문서 배선이 살아 있는지는 `scripts/check-dist.mjs` 가 **나간 사본**에서 확인한다
 * (manifest 링크·`<div id="root">`·`<title>`·동기 테마 스크립트) — 이 변환이 언젠가 과하게 지우면 빌드가 실패한다.
 */
function stripHtmlComments(): Plugin {
  return {
    name: 'tasky:strip-html-comments',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: (html) => html.replace(/\n?[ \t]*<!--[\s\S]*?-->/g, ''),
    },
  };
}

const config = defineConfig({
  plugins: [react(), preloadAsyncChunks(), stripHtmlComments()],
  // tsconfig.json 의 paths 와 한 쌍이다(vitest.config.ts 도 같은 별칭을 따로 건다).
  resolve: { alias: { '@': src } },
  server: {
    // `pnpm dev`(vite, 이 파일)와 `pnpm start`(wrangler dev, worker/index.ts)를 동시에 띄워 개발할
    // 때 브라우저가 8787(Worker)로 직접 요청하지 않고 vite dev 서버(기본 5173)를 그대로 두고
    // /api·/auth 요청만 넘긴다 — CORS·쿠키 도메인 분리를 피한다(같은 오리진으로 보인다). `pnpm dev`
    // 만 띄웠을 때는(Worker 없음) 이 프록시가 그냥 연결 실패로 넘어갈 뿐 vite 자체는 그대로 돈다.
    proxy: {
      '/api': 'http://localhost:8787',
      '/auth': 'http://localhost:8787',
    },
  },
  build: {
    // dist/client 를 유지한다: serwist.config.js 의 globDirectory, scripts/deploy.sh 의 산출물 검사,
    // wrangler.jsonc 의 assets.directory, 배포 워크플로가 모두 이 경로를 가리킨다.
    outDir: 'dist/client',
    // 설치된 Vite optional peer(잠금 파일의 terser)를 사용한다. unsafe 변환은 켜지 않는다.
    minify: 'terser',
    terserOptions: { module: true, compress: { passes: 2 } },
    rolldownOptions: {
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: ['personal-dialogs', 'shared-primitives', 'react-vendor'].map((name) => ({
            name,
            test: (id: string) => bundleGroup(id) === name,
          })),
        },
      },
    },
    emptyOutDir: true,
    // public/_headers 의 immutable 규칙이 이 디렉토리 이름과 한 쌍이다 — 바꾸면 그 파일도 같이 바꾼다.
    // scripts/check-dist.mjs 가 매 빌드 산출물 경로 하나하나를 _headers 글롭에 대조하므로 한쪽만 바꾸면 빌드가 실패한다.
    assetsDir: 'assets',
  },
});

export default config;
