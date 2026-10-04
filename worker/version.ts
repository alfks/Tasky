// `GET /api/version` — 비인증·비민감. 배포본이 어느 커밋인지 `curl` 한 번으로 확인한다.
// `BUILD_SHA` 는 scripts/deploy.sh 가 `--var` 로 넣는다(없으면 'dev').
import type { Env } from './env';

export function handleVersion(env: Env): Response {
  return new Response(JSON.stringify({ sha: env.BUILD_SHA ?? 'dev', protocol: 1 }), {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}
