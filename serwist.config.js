import { readFileSync } from 'node:fs';

import { classifyGraph } from './scripts/bundle-graph.mjs';

// 그래프가 없거나 잘못되면 빌드를 중단한다. 개인 공유 의존성은 optional로 제외하지 않는다.
const graph = JSON.parse(readFileSync('dist/client/bundle-graph.json', 'utf8'));
const { optional } = classifyGraph(graph);

// 읽기 조건: 프리캐시 대상·상한(specs/pwa.md R3·R10)을 바꿀 때.
// vite build 가 끝난 뒤 dist/client 를 글로브한다 — 번들러와 무관한 CLI 라 빌드 이후에 돌릴 수 있다(ADR-0013).
// 프리캐시 목록의 실제 내용은 scripts/check-dist.mjs 가 빌드마다 검사한다(index.html·manifest·폰트·상한).
const config = {
  swSrc: 'src/sw.ts',
  swDest: 'dist/client/sw.js',
  globDirectory: 'dist/client',
  globPatterns: ['**/*.{html,js,css,woff2,png,svg,ico,webmanifest,txt}'],
  globIgnores: ['sw.js', 'AGENTS.md', ...optional],
  maximumFileSizeToCacheInBytes: 2621440, // 2.5MB — specs/pwa.md R10
};

export default config;
