// 자격증명 없는 로컬 검증용 스텁 로그인(SYNC_DESIGN.md §②-4, docs/specs/sync.md 선행 조건).
// `GET /auth/stub-login?sub=<sub>&email=<email>` 이 구글 왕복 없이 즉시 세션을 만든다. T-94 의
// e2e 가 이 경로로 로그인한다.
//
// **2중 가드(둘 다 참이어야 동작)**: `env.AUTH_STUB === '1'` **그리고** 요청 호스트가
// localhost/127.0.0.1. 하나라도 거짓이면 404(로그인 경로가 있다는 사실 자체를 숨긴다 — 403 은
// "있지만 막혔다"를 알려줘 배포된 Worker 를 정찰하는 신호가 된다).
import { setSessionCookie } from './cookies';
import { createSession } from './session';

import type { Env } from '../env';

const STUB_HOSTS = new Set(['localhost', '127.0.0.1']);

/** 두 조건이 각각 독립적으로 가드다 — 부정 테스트 2건이 이 함수를 직접 쓴다(auth/stub.test.ts). */
export function isStubAllowed(env: Env, request: Request): boolean {
  return env.AUTH_STUB === '1' && STUB_HOSTS.has(new URL(request.url).hostname);
}

export async function handleStubLogin(request: Request, env: Env, now: string): Promise<Response> {
  if (!isStubAllowed(env, request)) {
    return new Response('not found', { status: 404 });
  }
  const url = new URL(request.url);
  const sub = url.searchParams.get('sub');
  const email = url.searchParams.get('email');
  if (!sub || !email) {
    return new Response('sub, email 쿼리 파라미터가 필요합니다', { status: 400 });
  }
  await env.DB.prepare(
    'INSERT INTO users (sub, email, created_at) VALUES (?, ?, ?) ON CONFLICT(sub) DO UPDATE SET email = excluded.email',
  )
    .bind(sub, email, now)
    .run();
  await env.DB.prepare('DELETE FROM deleted_users WHERE sub = ?').bind(sub).run();
  const { signedSid } = await createSession(env, sub, now);
  return new Response(null, {
    status: 302,
    headers: { Location: '/', 'Set-Cookie': setSessionCookie(signedSid) },
  });
}
