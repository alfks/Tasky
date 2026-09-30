// 요청 라우팅 — CSRF·본문 크기 상한·세션 확인을 여기서 한 번에 강제한 뒤 각 핸들러로 넘긴다
// (SYNC_DESIGN.md §②-3). 정적 자산(그 밖의 모든 경로)은 `worker/index.ts` 가 `env.ASSETS` 로 넘긴다
// (`run_worker_first`) — 이 파일은 `/api/*`·`/auth/*` 만 안다.
import { handleAccountDelete } from './account/delete';
import { setSessionCookie } from './auth/cookies';
import {
  handleCallback,
  handleLogin,
  handleLogout,
  handleLogoutOthers,
  handleMe,
  sessionErrorResponse,
} from './auth/handlers';
import { requireSession } from './auth/session';
import { handleStubLogin } from './auth/stub';
import { forUser } from './db/user-db';
import { handlePublicRequest } from './social/public-router';
import { handleSocialRequest } from './social/router';
import { handleSync } from './sync/handler';

import type { Env } from './env';

const MAX_BODY_BYTES = 2 * 1024 * 1024; // 2 MB(SYNC_DESIGN.md §②-3)

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
}

/** CSRF(SYNC_DESIGN.md §②-3): `SameSite=Lax` 에 더해 POST 는 커스텀 헤더를 요구한다 — 교차 출처
 * `<form>` 제출은 이 헤더를 붙일 수 없다. */
function hasCsrfHeader(request: Request): boolean {
  return request.headers.get('X-Tasky') === '1';
}
function hasJsonContentType(request: Request): boolean {
  return (request.headers.get('Content-Type') ?? '').split(';')[0]?.trim() === 'application/json';
}
function csrfRejected(): Response {
  return json({ error: 'csrf' }, { status: 403 });
}

/** 2 MB 상한(SYNC_DESIGN.md §②-3) — 본문을 실제로 읽어 바이트 수를 확정한다(`Content-Length`
 * 헤더는 클라이언트가 정직하다는 전제가 있어야만 믿을 수 있어, 있으면 우선 컷하되 없거나 거짓이어도
 * 읽은 뒤 다시 잰다). 반환하는 버퍼는 호출부가 필요하면 다시 디코드한다(`/api/account/delete` 는
 * 본문을 요구하지 않으므로 크기만 보고 버린다). */
async function enforceBodySize(
  request: Request,
): Promise<{ ok: true; buffer: ArrayBuffer } | { ok: false; response: Response }> {
  const declared = request.headers.get('Content-Length');
  if (declared !== null && Number(declared) > MAX_BODY_BYTES) {
    return { ok: false, response: json({ error: 'payload too large' }, { status: 413 }) };
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) {
    return { ok: false, response: json({ error: 'payload too large' }, { status: 413 }) };
  }
  return { ok: true, buffer };
}

async function readJsonBody(
  request: Request,
): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const sized = await enforceBodySize(request);
  if (!sized.ok) return sized;
  try {
    const text = new TextDecoder().decode(sized.buffer);
    return { ok: true, body: text.length > 0 ? JSON.parse(text) : {} };
  } catch {
    return { ok: false, response: json({ error: 'malformed json' }, { status: 400 }) };
  }
}

export async function handleRequest(request: Request, env: Env, now: string): Promise<Response> {
  const url = new URL(request.url);
  const { pathname } = url;
  const { method } = request;

  if (pathname.startsWith('/api/social/public/')) return handlePublicRequest(request, env, now);
  if (pathname.startsWith('/api/social/')) return handleSocialRequest(request, env, now);

  if (method === 'GET' && pathname === '/auth/login') return handleLogin(request, env);
  if (method === 'GET' && pathname === '/auth/callback') return handleCallback(request, env, now);
  if (method === 'GET' && pathname === '/auth/stub-login')
    return handleStubLogin(request, env, now);

  if (method === 'POST' && pathname === '/auth/logout') {
    if (!hasCsrfHeader(request)) return csrfRejected();
    return handleLogout(request, env, now);
  }

  if (method === 'POST' && pathname === '/auth/logout-others') {
    if (!hasCsrfHeader(request)) return csrfRejected();
    return handleLogoutOthers(request, env, now);
  }

  if (method === 'GET' && pathname === '/api/me') return handleMe(request, env, now);

  if (method === 'POST' && pathname === '/api/sync') {
    if (!hasCsrfHeader(request) || !hasJsonContentType(request)) return csrfRejected();
    // 세션 확인이 본문 버퍼링보다 먼저 — 무쿠키 요청이 2 MB 를 반복 보내면 인증 전에 전량
    // 버퍼링 + JSON.parse 가 끝나는 것을 막는다(§0 상태 블록 4번).
    const session = await requireSession(request, env, now);
    if (!session.ok) return sessionErrorResponse(session);
    const parsed = await readJsonBody(request);
    if (!parsed.ok) return parsed.response;
    const userDb = forUser(env.DB, session.sub);
    const { status, response } = await handleSync(parsed.body, userDb, now);
    const headers: Record<string, string> = {};
    if (session.refreshedCookie) headers['Set-Cookie'] = setSessionCookie(session.refreshedCookie);
    return json(response, { status, headers });
  }

  if (method === 'POST' && pathname === '/api/account/delete') {
    if (!hasCsrfHeader(request) || !hasJsonContentType(request)) return csrfRejected();
    // 세션 확인이 본문 버퍼링보다 먼저(위 /api/sync 와 같은 이유, §0 상태 블록 4번).
    const session = await requireSession(request, env, now);
    if (!session.ok) return sessionErrorResponse(session);
    const sized = await enforceBodySize(request); // 본문 내용은 쓰지 않는다 — 크기 상한만 적용
    if (!sized.ok) return sized.response;
    return handleAccountDelete(env, session, now);
  }

  return json({ error: 'not found' }, { status: 404 });
}
