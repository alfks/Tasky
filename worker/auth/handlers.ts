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
import { destroyOtherSessions, destroySession, requireSession, signIn } from './session';

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

  // `users` upsert · 세션 전량 폐기 판정 · `deleted_users` 표식 삭제 · 새 세션 발급은
  // `session.ts#signIn` 한 곳으로 합쳐져 있다(ADR-0020) — 로컬 스텁(`stub.ts#handleStubLogin`)도
  // 같은 함수를 부른다.
  //
  // **정정(이전 판은 무조건 폐기했다)**: 예전엔 로그인마다 무조건 `DELETE FROM sessions WHERE
  // sub = ?` 를 돌렸다. 그 이유였던 공격은 그대로 실재한다 — 삭제된 계정 기록(`deleted_users`)이
  // 있으면 재가입 시점에 지워야 본인이 같은 구글 계정으로 다시 가입하는 정상 흐름을 영구히 막지
  // 않는데(docs/specs/sync.md §6 "함정" 각주, ADR-0019 §계정 삭제), **걸러지는 것은 "다음 요청을
  // 보낸" 세션뿐**이다(`session.ts#requireSession` 의 410 판정은 요청이 와야 발동하는 지연 정리다).
  // 삭제 창 동안 요청을 한 번도 안 보낸 세션(탈취된 쿠키 포함)은 `sessions` 행이 손대지 않은 채
  // 남고, `deleted_users` 표식을 지우는 순간 되살아난다(실 D1 재현됨). 그런데 **무조건 폐기는 이
  // 방어와 무관한 대가를 치렀다** — 같은 계정으로 이미 로그인해 있던 다른 기기의 세션까지 매
  // 로그인마다 같이 죽였다(사용자 보고 버그). SYNC_DESIGN.md §②-3 은 `/auth/logout` 을 "자기
  // `sid` 행만 삭제(다른 기기 유지)" 로 이미 적어 두었었다 — 세션이 기기마다 따로 사는 것이 원래
  // 설계였고, 로그인 시점의 전량 폐기만 그 설계와 어긋나 있었다.
  //
  // **그래서 폐기를 없애는 대신 조건을 건다**: `deleted_users` 에 이 sub 행이 있을 때만 지운다
  // (`signIn` 내부의 `EXISTS` 판정, 판정과 삭제를 한 문장에 둔다 — ADR-0020 §3). 재가입이 아닌
  // 평범한 로그인은 `deleted_users` 행이 없으므로 그 문장이 0행에 맞아 다른 기기를 살려 두고,
  // 재가입일 때만 옛 코드와 같은 결과(그 sub 의 세션 전량 삭제 후 새 세션 발급)를 낸다 — 옛
  // 코드의 순서 보장(폐기 → 표식 삭제 → 새 세션 발급)은 그대로다.
  const { signedSid } = await signIn(env, identity, now);
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

/**
 * "다른 기기 모두 로그아웃"(ADR-0020 §결정 5) — 호출자의 세션은 그대로 두고 그 `sub` 의 나머지
 * `sessions` 행만 지운다. 슬라이딩 갱신을 그대로 적용한다(`/api/sync` 와 같은 이유 — 호출자
 * 세션은 이 요청 뒤에도 계속 쓰이므로 갱신 기회를 놓치지 않는다).
 */
export async function handleLogoutOthers(
  request: Request,
  env: Env,
  now: string,
): Promise<Response> {
  const result = await requireSession(request, env, now);
  if (!result.ok) {
    return new Response(null, { status: result.status === 410 ? 410 : 401 });
  }
  await destroyOtherSessions(env, result.sub, result.sid);
  const headers: Record<string, string> = {};
  if (result.refreshedCookie) headers['Set-Cookie'] = setSessionCookie(result.refreshedCookie);
  return new Response(null, { status: 204, headers });
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
