import { SESSION_COOKIE } from '../auth/cookies';
import { createSession } from '../auth/session';
import { handleRequest } from '../router';
import { createD1Fixture } from '../test/d1-harness';

import type { Env } from '../env';

export const ORIGIN = 'https://tasky.example.workers.dev';
export const NOW = '2026-01-01T00:00:00.000Z';
export const key = (n: number) => `v1.${Date.parse(NOW)}.${n.toString(16).padStart(32, '0')}`;

type Seen = {
  path: string;
  method: string;
  headers: Headers;
  credentials?: string;
  cache?: string;
  bodyPreserved: boolean;
  status: number;
  cacheControl: string | null;
  vary: string | null;
  envelopeOk: boolean;
  retryAfter: string | null;
  cookieAction: 'set' | 'clear' | null;
};
export type Client = {
  transport: typeof fetch;
  jar: Map<string, string>;
  seen: Seen[];
  origin: { value: string };
};
export type Server = {
  env: Env;
  clock: { value: string };
  actor: (sub: string) => Promise<Client>;
};

function updateJar(jar: Map<string, string>, cookie: string | null): void {
  if (cookie === null) return;
  const first = cookie.split(';', 1)[0];
  const equal = first.indexOf('=');
  if (equal < 0) return;
  const name = first.slice(0, equal);
  if (name !== SESSION_COOKIE) return;
  if (/(?:^|;)\s*Max-Age=0(?:;|$)/i.test(cookie)) jar.delete(name);
  else jar.set(name, first.slice(equal + 1));
}

async function envelopeOf(response: Response): Promise<boolean> {
  try {
    const value: unknown = await response.clone().json();
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
    const data = value as Record<string, unknown>;
    return typeof data.serverTime === 'number' && 'data' in data !== 'error' in data;
  } catch {
    return false;
  }
}

function client(env: Env, clock: Server['clock'], signedSid: string): Client {
  const jar = new Map([[SESSION_COOKIE, encodeURIComponent(signedSid)]]);
  const seen: Seen[] = [];
  const origin = { value: ORIGIN };
  const transport: typeof fetch = async (input, init) => {
    const browserInit = init as (RequestInit & { credentials?: string }) | undefined;
    if (typeof input !== 'string' && !(input instanceof URL)) {
      throw new Error('어댑터는 string 또는 URL 경로만 전달해야 합니다.');
    }
    const path = String(input);
    const url = new URL(path, ORIGIN);
    if (
      url.origin !== ORIGIN ||
      browserInit?.credentials !== 'include' ||
      init?.cache !== 'no-store'
    ) {
      throw new Error('어댑터의 출처·쿠키·캐시 계약이 변경됐습니다.');
    }
    const headers = new Headers(init?.headers);
    const adapterHeaders = new Headers(headers);
    const method = init?.method ?? 'GET';
    if (method === 'POST' && !headers.has('Origin')) headers.set('Origin', origin.value);
    if (jar.size) headers.set('Cookie', [...jar].map(([k, v]) => `${k}=${v}`).join('; '));
    const request = new Request(url, { ...init, headers });
    const bodyPreserved = (await request.clone().text()) === String(init?.body ?? '');
    const response = await handleRequest(request, env, clock.value);
    const setCookie = response.headers.get('Set-Cookie');
    const envelopeOk = await envelopeOf(response);
    seen.push({
      path,
      method,
      headers: adapterHeaders,
      credentials: browserInit?.credentials,
      cache: init?.cache,
      bodyPreserved,
      status: response.status,
      cacheControl: response.headers.get('Cache-Control'),
      vary: response.headers.get('Vary'),
      envelopeOk,
      retryAfter: response.headers.get('Retry-After'),
      cookieAction:
        setCookie === null ? null : /Max-Age=0(?:;|$)/i.test(setCookie) ? 'clear' : 'set',
    });
    updateJar(jar, setCookie);
    return response;
  };
  return { transport, jar, seen, origin };
}

export async function withServer(run: (server: Server) => Promise<void>): Promise<void> {
  const fx = await createD1Fixture();
  const prior = Object.getOwnPropertyDescriptor(globalThis, 'location');
  try {
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { origin: ORIGIN },
    });
    const clock = { value: NOW };
    const env: Env = {
      DB: fx.db,
      ASSETS: {} as Fetcher,
      GOOGLE_CLIENT_ID: 'fixture',
      GOOGLE_CLIENT_SECRET: 'fixture',
      SESSION_SECRET: 'fixture-secret',
      SOCIAL_MODE: 'enabled',
      SOCIAL_ALLOWLIST: '["a","b","c"]',
    };
    await run({
      env,
      clock,
      actor: async (sub) => {
        await env.DB.prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
          .bind(sub, `${sub}@example.test`, NOW)
          .run();
        const { signedSid } = await createSession(env, sub, NOW);
        return client(env, clock, signedSid);
      },
    });
  } finally {
    try {
      if (prior) Object.defineProperty(globalThis, 'location', prior);
      else Reflect.deleteProperty(globalThis, 'location');
    } finally {
      await fx.dispose();
    }
  }
}
