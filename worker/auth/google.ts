// 구글 OAuth 2.0 Authorization Code + PKCE 제공자(sync.md R2, SYNC_DESIGN.md §②-4).
// **id_token JWT 검증 라이브러리를 쓰지 않는다** — 코드 교환 뒤 `userinfo` 엔드포인트를 서버→서버
// HTTPS 로 직접 호출해 `sub`·`email` 을 받는다(의존성 0).
import type { IdentityProvider } from './provider';

const AUTHORIZE_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

type TokenResponse = { access_token?: string; error?: string; error_description?: string };
type UserinfoResponse = { sub?: string; email?: string; email_verified?: boolean };

export function createGoogleProvider(
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): IdentityProvider {
  return {
    authorizeUrl(state, codeChallenge) {
      const url = new URL(AUTHORIZE_URL);
      url.searchParams.set('client_id', clientId);
      url.searchParams.set('redirect_uri', redirectUri);
      url.searchParams.set('response_type', 'code');
      url.searchParams.set('scope', 'openid email');
      url.searchParams.set('state', state);
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      return url.toString();
    },
    async exchange(code, codeVerifier) {
      const tokenRes = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          code_verifier: codeVerifier,
        }),
      });
      const token = (await tokenRes.json()) as TokenResponse;
      if (!tokenRes.ok || !token.access_token) {
        throw new Error(
          `google token exchange failed: ${token.error ?? tokenRes.status} ${token.error_description ?? ''}`,
        );
      }
      const userinfoRes = await fetch(USERINFO_URL, {
        headers: { Authorization: `Bearer ${token.access_token}` },
      });
      const info = (await userinfoRes.json()) as UserinfoResponse;
      if (!userinfoRes.ok || !info.sub || !info.email) {
        throw new Error(`google userinfo failed: ${userinfoRes.status}`);
      }
      return { sub: info.sub, email: info.email };
    },
  };
}
