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

/**
 * `handleCallback` 의 실패 분기 로그(#132 후속) — 클라이언트는 항상 `?auth=error` 만 보고 원인은
 * 절대 모른다(#126 보안 리뷰: 에러 응답은 고정 문자열). 대신 `wrangler tail` 로 서버에서만 보이는
 * 분기 이름을 남긴다. `detail` 에는 구글이 돌려준 `error`/`error_description`·HTTP 상태처럼
 * `google.ts` 가 이미 다듬어 놓은 값만 싣는다 — `code`·`code_verifier`·비밀·세션 토큰은 절대 넣지
 * 않는다(같은 파일 jsdoc, CLAUDE.md 로그 제약).
 */
function logCallbackFailure(reason: string, detail?: string): void {
  console.error(detail ? `[auth/callback] ${reason}: ${detail}` : `[auth/callback] ${reason}`);
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
  if (!code || !state) {
    logCallbackFailure('code/state 없음');
    return redirect('?auth=error');
  }

  const cookies = parseCookies(request.headers.get('Cookie'));
  const raw = cookies[OAUTH_STATE_COOKIE];
  if (!raw) {
    logCallbackFailure('state 쿠키 없음');
    return redirect('?auth=error');
  }
  const payload = await verifySignedValue(raw, env.SESSION_SECRET);
  if (!payload) {
    logCallbackFailure('쿠키 서명 불일치');
    return redirect('?auth=error');
  }
  const [savedState, verifier] = payload.split(':');
  if (!savedState || !verifier || savedState !== state) {
    logCallbackFailure('state 불일치');
    return redirect('?auth=error');
  }

  let identity: { sub: string; email: string };
  try {
    identity = await googleFor(request, env).exchange(code, verifier);
  } catch (err) {
    logCallbackFailure('구글 교환 실패', err instanceof Error ? err.message : String(err));
    return redirect('?auth=error');
  }

  await env.DB.prepare(
    'INSERT INTO users (sub, email, created_at) VALUES (?, ?, ?) ON CONFLICT(sub) DO UPDATE SET email = excluded.email',
  )
    .bind(identity.sub, identity.email, now)
    .run();
  // 삭제된 계정 기록이 있으면 재로그인 시점에 지운다 — 본인이 같은 구글 계정으로 다시 가입하는
  // 정상 흐름을 영구히 막지 않는다(docs/specs/sync.md §6 "함정" 각주, ADR-0019 §계정 삭제).
  //
  // **정정(이전 판은 틀렸다)**: 예전 주석은 "이 시점의 부활 위험은 여기서 발생하지 않는다 — 다른
  // 기기의 다음 요청은 자신의 세션으로 인증하고, 그 세션은 삭제 시점에 이미 deleted_users 로
  // 걸러졌을 것"이라고 단언했는데, 그 전제가 틀렸다 — **걸러지는 것은 "다음 요청을 보낸" 세션뿐**
  // 이다(session.ts#requireSession 의 410 판정은 요청이 와야 발동하는 지연 정리다). 삭제 창 동안
  // 그 기기가 요청을 한 번도 안 보내면 `sessions` 행은 손대지 않은 채 그대로 남는다. 세션 쿠키를
  // 탈취당한 사용자가 계정을 지워 그 세션을 무력화하려 해도, 걸러지지 않은 그 세션 행이 남아있는
  // 채로 같은 구글 계정으로 재가입하면 아래 `DELETE FROM deleted_users` 가 "삭제됨" 표식을 지우는
  // 순간 그 탈취된 쿠키가 다시 유효해진다(실 D1 재현됨). 그래서 `deleted_users` 를 지우기 **전에**
  // 이 sub 의 `sessions` 를 전부 지운다 — 재가입으로 방금 만든 새 세션(아래 `createSession`)은 이
  // 문장 **뒤에** 발급되므로 영향받지 않는다.
  await env.DB.prepare('DELETE FROM sessions WHERE sub = ?').bind(identity.sub).run();
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
