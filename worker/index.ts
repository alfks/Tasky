// Worker 진입점. `wrangler.jsonc` 의 `main` + `run_worker_first: ["/api/*", "/auth/*"]` 가 이 파일을
// 그 두 경로에만 태운다 — 그 밖의 요청은 Cloudflare 가 `env.ASSETS`(정적 SPA)로 먼저 보낸다.
// Worker 모듈 엔트리는 `export default { fetch }` 가 필수라 `import/no-default-export` 예외를
// 이 파일에만 연다(eslint.config.mjs, ARCH_RULES_COMMON 의 설정 파일 예외와 같은 방식).
import { handleRequest } from './router';

import type { Env } from './env';

const worker = {
  async fetch(request: Request, env: Env): Promise<Response> {
    const now = new Date().toISOString();
    return handleRequest(request, env, now);
  },
};

export default worker;
