// `handleCallback` 의 다섯 `?auth=error` 분기(T-후속, #132 이후) — 클라이언트 응답은 항상
// `302 /?auth=error` 로 고정되지만(#126 보안 리뷰: 에러 응답은 고정 문자열, 원인 비노출), 서버
// 로그(`console.error`)에는 분기마다 다른 원인이 남아야 진단할 수 있다. 이 파일은 다섯 분기가
// 서로 다른 로그를 남기는지, 그리고 로그를 지우면(=돌연변이) 빨개지는지를 고정한다.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OAUTH_STATE_COOKIE } from './cookies';
import { handleCallback } from './handlers';
import { signValue } from './hmac';

import type { Env } from '../env';

const ORIGIN = 'https://tasky.example.workers.dev';

function envOf(): Env {
  return {
    DB: {} as D1Database,
    ASSETS: {} as Fetcher,
    GOOGLE_CLIENT_ID: 'client-id',
    GOOGLE_CLIENT_SECRET: 'client-secret',
    SESSION_SECRET: 'test-secret',
  };
}

function callbackRequest(query: string, cookie?: string): Request {
  return new Request(`${ORIGIN}/auth/callback${query}`, {
    headers: cookie ? { Cookie: cookie } : {},
  });
}

async function stateCookie(state: string, verifier: string, secret: string): Promise<string> {
  const signed = await signValue(`${state}:${verifier}`, secret);
  return `${OAUTH_STATE_COOKIE}=${encodeURIComponent(signed)}`;
}

describe('handleCallback — 실패 5경로는 클라이언트 응답은 같고 로그만 다르다', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function assertFixedClientResponse(response: Response) {
    expect(response.status).toBe(302);
    expect(response.headers.get('Location')).toBe('/?auth=error');
    // 원인이 노출되면 안 된다 — 응답 몸통·헤더 어디에도 분기 이름이 실리지 않는다.
    expect(await response.text()).toBe('');
  }

  it('1) code/state 쿼리가 없으면 그 사실을 로그로 남긴다', async () => {
    const env = envOf();
    const response = await handleCallback(callbackRequest(''), env, '2026-01-01T00:00:00.000Z');
    await assertFixedClientResponse(response);
    expect(console.error).toHaveBeenCalledExactlyOnceWith('[auth/callback] code/state 없음');
  });

  it('2) state 쿠키가 없으면 그 사실을 로그로 남긴다', async () => {
    const env = envOf();
    const response = await handleCallback(
      callbackRequest('?code=c&state=s'),
      env,
      '2026-01-01T00:00:00.000Z',
    );
    await assertFixedClientResponse(response);
    expect(console.error).toHaveBeenCalledExactlyOnceWith('[auth/callback] state 쿠키 없음');
  });

  it('3) 쿠키 서명이 안 맞으면 그 사실을 로그로 남긴다', async () => {
    const env = envOf();
    const response = await handleCallback(
      callbackRequest('?code=c&state=s', `${OAUTH_STATE_COOKIE}=not-a-signed-value`),
      env,
      '2026-01-01T00:00:00.000Z',
    );
    await assertFixedClientResponse(response);
    expect(console.error).toHaveBeenCalledExactlyOnceWith('[auth/callback] 쿠키 서명 불일치');
  });

  it('4) 쿠키 안 state 와 쿼리 state 가 다르면 그 사실을 로그로 남긴다', async () => {
    const env = envOf();
    const cookie = await stateCookie('saved-state', 'verifier', env.SESSION_SECRET);
    const response = await handleCallback(
      callbackRequest('?code=c&state=different-state', cookie),
      env,
      '2026-01-01T00:00:00.000Z',
    );
    await assertFixedClientResponse(response);
    expect(console.error).toHaveBeenCalledExactlyOnceWith('[auth/callback] state 불일치');
  });

  it('5) 구글 코드 교환이 실패하면 원인(google.ts 의 메시지)을 로그로 남긴다', async () => {
    const env = envOf();
    const cookie = await stateCookie('matching-state', 'verifier', env.SESSION_SECRET);
    global.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'invalid_grant', error_description: 'Bad Request' }), {
        status: 400,
      }),
    );
    const response = await handleCallback(
      callbackRequest('?code=auth-code&state=matching-state', cookie),
      env,
      '2026-01-01T00:00:00.000Z',
    );
    await assertFixedClientResponse(response);
    expect(console.error).toHaveBeenCalledExactlyOnceWith(
      '[auth/callback] 구글 교환 실패: google token exchange failed: invalid_grant Bad Request',
    );
    // 비밀·code·code_verifier 는 어떤 로그 호출에도 실리지 않는다.
    const logged = vi.mocked(console.error).mock.calls.flat().join(' ');
    expect(logged).not.toContain(env.GOOGLE_CLIENT_SECRET);
    expect(logged).not.toContain(env.SESSION_SECRET);
    expect(logged).not.toContain('auth-code');
    expect(logged).not.toContain('verifier');
  });

  it('다섯 분기는 서로 다른 로그 메시지를 남긴다(진단 가능성의 핵심)', async () => {
    const env = envOf();
    const messages: string[] = [];
    vi.mocked(console.error).mockImplementation((msg: unknown) => {
      messages.push(String(msg));
    });

    await handleCallback(callbackRequest(''), env, '2026-01-01T00:00:00.000Z');
    await handleCallback(callbackRequest('?code=c&state=s'), env, '2026-01-01T00:00:00.000Z');
    await handleCallback(
      callbackRequest('?code=c&state=s', `${OAUTH_STATE_COOKIE}=garbage`),
      env,
      '2026-01-01T00:00:00.000Z',
    );
    const mismatchCookie = await stateCookie('saved', 'verifier', env.SESSION_SECRET);
    await handleCallback(
      callbackRequest('?code=c&state=other', mismatchCookie),
      env,
      '2026-01-01T00:00:00.000Z',
    );
    const okCookie = await stateCookie('ok-state', 'verifier', env.SESSION_SECRET);
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ error: 'server_error' }), { status: 500 }));
    await handleCallback(
      callbackRequest('?code=c&state=ok-state', okCookie),
      env,
      '2026-01-01T00:00:00.000Z',
    );

    expect(messages).toHaveLength(5);
    expect(new Set(messages).size).toBe(5); // 다섯 메시지가 전부 서로 다르다
  });
});
