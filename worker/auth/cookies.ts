// 쿠키 파싱·직렬화 — 이 파일만 `Cookie`/`Set-Cookie` 헤더 문자열을 다룬다.
// 속성은 sync.md §4·SYNC_DESIGN.md §②-4 그대로: HttpOnly; Secure; SameSite=Lax; Path=/.
// **`Secure` 는 `wrangler dev`(http://localhost)에서도 내리지 않는다** — Chrome·Firefox 는
// localhost 를 안전 출처로 취급해 Secure 쿠키를 정상적으로 주고받는다(SYNC_DESIGN.md §②-4 실측
// 전제). 환경별로 값을 가르지 않으므로 이 파일에 호스트 분기가 없다.

export const SESSION_COOKIE = 'tasky_session';
export const OAUTH_STATE_COOKIE = 'tasky_oauth';

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30일(sync.md §8 슬라이딩 기본값)
const OAUTH_STATE_MAX_AGE = 60 * 10; // 10분(PKCE state 쿠키, ②-3)

export function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    const name = part.slice(0, eq).trim();
    const value = part.slice(eq + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

function serialize(name: string, value: string, maxAge: number | 0): string {
  const attrs = [
    `${name}=${encodeURIComponent(value)}`,
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    'Path=/',
    `Max-Age=${maxAge}`,
  ];
  return attrs.join('; ');
}

export const setSessionCookie = (sid: string): string =>
  serialize(SESSION_COOKIE, sid, SESSION_MAX_AGE);
export const clearSessionCookie = (): string => serialize(SESSION_COOKIE, '', 0);
export const setOauthStateCookie = (value: string): string =>
  serialize(OAUTH_STATE_COOKIE, value, OAUTH_STATE_MAX_AGE);
export const clearOauthStateCookie = (): string => serialize(OAUTH_STATE_COOKIE, '', 0);
