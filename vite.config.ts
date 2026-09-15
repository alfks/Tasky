// 읽기 조건: 빌드 파이프라인(Vinext · Cloudflare Workers)을 바꿀 때.
// @vitejs/plugin-rsc 와 @vitejs/plugin-react 는 vinext() 가 자동 등록한다 — 여기에 직접 쓰면
// "Duplicate @vitejs/plugin-rsc" 로 빌드가 실패한다. 캐시·이미지 어댑터는 쓰지 않는다(ADR-0010 §결과).
import { cloudflare } from '@cloudflare/vite-plugin';
import vinext from 'vinext';
import { defineConfig } from 'vite';

const config = defineConfig({
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
    }),
  ],
});

export default config;
