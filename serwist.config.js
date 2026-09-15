// 읽기 조건: 프리캐시 대상·상한(specs/pwa.md R3·R10)을 바꿀 때.
// vinext build 가 끝난 뒤(프리렌더 HTML 포함) dist/client 를 글로브한다 — 번들러와 무관한 CLI 라
// Vinext 의 5단계 빌드 이후에 돌릴 수 있다(ADR-0010).
const config = {
  swSrc: 'src/sw.ts',
  swDest: 'dist/client/sw.js',
  globDirectory: 'dist/client',
  globPatterns: ['**/*.{html,js,css,woff2,png,svg,ico,webmanifest,txt}'],
  globIgnores: ['sw.js', 'AGENTS.md', '.vite/**', 'vinext-client-entry-manifest.json'],
  maximumFileSizeToCacheInBytes: 2621440, // 2.5MB — specs/pwa.md R10
};

export default config;
