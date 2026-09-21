// `/auth/login`·`/auth/callback`·`/auth/logout`·`/api/me` 핸들러(SYNC_DESIGN.md §②-3).
// 구글 토큰은 브라우저에 한 번도 내려가지 않는다 — 이 파일이 Worker 안에서만 코드 교환을 한다.
import {
  clearOauthStateCookie,
  clearSessionCookie,
  OAUTH_STATE_COOKIE,
  parseCookies,
  setOauthStateCookie,
  setSessionCookie,
} from './cookies';
import { createGoogleProvider } from './google';
import { randomToken, signValue, verifySignedValue } from './hmac';
import { codeChallengeS256 } from './pkce';
import { createSession, destroySession, requireSession } from './session';

import type { Env } from '../env';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

function json(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { ...JSON_HEADERS, ...init.headers },
  });
}

function googleFor(request: Request, env: Env) {
  const redirectUri = new URL('/auth/callback', request.url).toString();
  return createGoogleProvider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, redirectUri);
}

export async function handleLogin(request: Request, env: Env): Promise<Response> {
  const state = randomToken(16);
  const verifier = randomToken();
  const challenge = await codeChallengeS256(verifier);
  // state 쿠키 payload 에 verifier 를 함께 싣는다(state 자체는 구글에 노출되지만 이 쿠키는
  // HttpOnly 라 브라우저 JS 는 못 읽는다 — verifier 를 같이 실어도 노출 표면이 늘지 않는다).
  const payload = `${state}:${verifier}`;
  const signed = await signValue(payload, env.SESSION_SECRET);
  const provider = googleFor(request, env);
  return new Response(null, {
    status: 302,
    headers: {
      Location: provider.authorizeUrl(state, challenge),
      'Set-Cookie': setOauthStateCookie(signed),
    },
  });
}

export async function handleCallback(request: Request, env: Env, now: string): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const errorParam = url.searchParams.get('error');
  const redirect = (suffix: string, clearState = true) =>
    new Response(null, {
      status: 302,
      headers: {
        Location: `/${suffix}`,
        ...(clearState ? { 'Set-Cookie': clearOauthStateCookie() } : {}),
      },
    });

  if (errorParam) return redirect('?auth=denied');
  if (!code || !state) return redirect('?auth=error');

  const cookies = parseCookies(request.headers.get('Cookie'));
  const raw = cookies[OAUTH_STATE_COOKIE];
  if (!raw) return redirect('?auth=error');
  const payload = await verifySignedValue(raw, env.SESSION_SECRET);
  if (!payload) return redirect('?auth=error');
  const [savedState, verifier] = payload.split(':');
  if (!savedState || !verifier || savedState !== state) return redirect('?auth=error');

  let identity: { sub: string; email: string };
  try {
    identity = await googleFor(request, env).exchange(code, verifier);
  } catch {
    return redirect('?auth=error');
  }

  await env.DB.prepare(
    'INSERT INTO users (sub, email, created_at) VALUES (?, ?, ?) ON CONFLICT(sub) DO UPDATE SET email = excluded.email',
  )
    .bind(identity.sub, identity.email, now)
    .run();
  // 삭제된 계정 기록이 있으면 재로그인 시점에 지운다 — 본인이 같은 구글 계정으로 다시 가입하는
  // 정상 흐름을 영구히 막지 않는다(docs/specs/sync.md §6 "함정" 각주, ADR-0019 §계정 삭제).
  // 이 시점의 "부활" 위험(다른 기기가 자동으로 옛 데이터를 되올리는 것)은 여기서 발생하지 않는다 —
  // 그 기기의 다음 동기화 요청은 **자신의** 세션으로 인증하고, 그 세션은 계정 삭제 시점에 이미
  // deleted_users 로 걸러졌을 것이므로(session.ts) 이 재가입과 무관하게 410 을 먼저 받는다.
  await env.DB.prepare('DELETE FROM deleted_users WHERE sub = ?').bind(identity.sub).run();

  const { signedSid } = await createSession(env, identity.sub, now);
  return new Response(null, {
    status: 302,
    headers: {
      Location: '/',
      'Set-Cookie': setSessionCookie(signedSid),
    },
  });
}

export async function handleLogout(request: Request, env: Env, now: string): Promise<Response> {
  const result = await requireSession(request, env, now);
  if (!result.ok) {
    return new Response(null, { status: result.status === 410 ? 410 : 401 });
  }
  await destroySession(env, result.sid);
  return new Response(null, { status: 204, headers: { 'Set-Cookie': clearSessionCookie() } });
}

export async function handleMe(request: Request, env: Env, now: string): Promise<Response> {
  const result = await requireSession(request, env, now);
  if (!result.ok) {
    if (result.status === 410) {
      return json(
        { error: 'account-deleted' },
        { status: 410, headers: { 'Set-Cookie': clearSessionCookie() } },
      );
    }
    return json({ error: 'unauthorized' }, { status: 401 });
  }
  const row = await env.DB.prepare('SELECT email FROM users WHERE sub = ?')
    .bind(result.sub)
    .first<{ email: string }>();
  const headers: Record<string, string> = {};
  if (result.refreshedCookie) headers['Set-Cookie'] = setSessionCookie(result.refreshedCookie);
  return json(
    { sub: result.sub, email: row?.email ?? '', expiresAt: result.expiresAt },
    { headers },
  );
}
