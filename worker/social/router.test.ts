import { describe, expect, it } from 'vitest';

import { createSession, signIn } from '../auth/session';
import { handleRequest } from '../router';
import { SOCIAL_ROUTES } from './policy';
import { createD1Fixture } from '../test/d1-harness';

import type { Env } from '../env';

const NOW = '2026-01-01T00:00:00.000Z';
const ORIGIN = 'https://tasky.example.workers.dev';
const KEY = (n: number) => `v1.${Date.parse(NOW)}.${n.toString(16).padStart(32, '0')}`;

function testEnv(db: D1Database): Env {
  return {
    DB: db,
    ASSETS: {} as Fetcher,
    GOOGLE_CLIENT_ID: 'x',
    GOOGLE_CLIENT_SECRET: 'x',
    SESSION_SECRET: 'secret',
    SOCIAL_MODE: 'enabled',
    SOCIAL_ALLOWLIST: '["a","b","c"]',
  };
}

async function user(env: Env, sub: string): Promise<string> {
  await env.DB.prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
    .bind(sub, `${sub}@x.test`, NOW)
    .run();
  const { signedSid } = await createSession(env, sub, NOW);
  return `tasky_session=${encodeURIComponent(signedSid)}`;
}

function request(path: string, cookie: string, body?: unknown, key?: string): Request {
  return new Request(`${ORIGIN}/api/social${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Cookie: cookie,
      ...(body === undefined
        ? {}
        : { Origin: ORIGIN, 'X-Tasky': '1', 'Content-Type': 'application/json' }),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('social HTTP boundary', () => {
  it('profile 없는 me와 생성, 목록, off 격리', async () => {
    const fx = await createD1Fixture();
    try {
      const env = testEnv(fx.db);
      const a = await user(env, 'a');
      const outsider = await user(env, 'outside');
      const before = await handleRequest(request('/me', a), env, NOW);
      expect(before.status).toBe(200);
      expect(await before.json()).toMatchObject({ data: { profile: null, mode: 'enabled' } });
      const created = await handleRequest(request('/profile', a, { nickname: 'A' }), env, NOW);
      expect(created.status).toBe(201);
      expect(await created.json()).toMatchObject({ data: { nickname: 'A', version: 0 } });
      const friends = await handleRequest(request('/friends', a), env, NOW);
      expect(friends.status).toBe(200);
      expect(await friends.json()).toMatchObject({ data: { items: [], nextCursor: null } });
      const off = await handleRequest(request('/me', outsider), env, NOW);
      expect(await off.json()).toMatchObject({ data: { mode: 'off' } });
      const blocked = await handleRequest(
        request('/profile', outsider, { nickname: 'X' }),
        env,
        NOW,
      );
      expect(blocked.status).toBe(503);
    } finally {
      await fx.dispose();
    }
  });

  it('Origin 검사는 인증 전에, 본문 상한은 인증 뒤에 적용한다', async () => {
    const fx = await createD1Fixture();
    try {
      const env = testEnv(fx.db);
      const a = await user(env, 'a');
      const missing = new Request(`${ORIGIN}/api/social/profile`, {
        method: 'POST',
        headers: { Cookie: a, 'X-Tasky': '1', 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect((await handleRequest(missing, env, NOW)).status).toBe(403);
      const huge = new Request(`${ORIGIN}/api/social/profile`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'X-Tasky': '1', 'Content-Type': 'application/json', Cookie: a },
        body: 'x'.repeat(8193),
      });
      expect((await handleRequest(huge, env, NOW)).status).toBe(413);
      const row = await env.DB.prepare(
        `SELECT count FROM social_limits WHERE bucket = 'write'`,
      ).first<{ count: number }>();
      expect(row?.count).toBe(1);
    } finally {
      await fx.dispose();
    }
  });

  it('transport 오류는 1회 과금하고 초과 시 429가 앞선다', async () => {
    const fx = await createD1Fixture();
    try {
      const env = testEnv(fx.db);
      const a = await user(env, 'a');
      const make = (contentType: string, body: string, cookie = a) =>
        new Request(`${ORIGIN}/api/social/profile`, {
          method: 'POST',
          headers: { Origin: ORIGIN, 'X-Tasky': '1', Cookie: cookie, 'Content-Type': contentType },
          body,
        });
      expect((await handleRequest(make('text/plain', '{}'), env, NOW)).status).toBe(415);
      expect((await handleRequest(make('application/json', '{'), env, NOW)).status).toBe(400);
      expect(
        (await handleRequest(make('application/json', 'x'.repeat(8193)), env, NOW)).status,
      ).toBe(413);
      const row = await env.DB.prepare(
        `SELECT subject,bucket,window_start,count
        FROM social_limits WHERE bucket = 'write'`,
      ).first<{
        subject: string;
        bucket: string;
        window_start: number;
        count: number;
      }>();
      expect(row?.count).toBe(3);
      expect(
        (await env.DB.prepare('SELECT COUNT(*) AS n FROM social_profiles').first<{ n: number }>())
          ?.n,
      ).toBe(0);
      await env.DB.prepare(
        `UPDATE social_limits SET count = 60 WHERE subject = ?
        AND bucket = ? AND window_start = ?`,
      )
        .bind(row!.subject, row!.bucket, row!.window_start)
        .run();
      expect(
        (await handleRequest(make('application/json', 'x'.repeat(8193)), env, NOW)).status,
      ).toBe(429);
      expect(
        (
          await env.DB.prepare(`SELECT count FROM social_limits WHERE subject = ?`)
            .bind(row!.subject)
            .first<{ count: number }>()
        )?.count,
      ).toBe(60);
      expect((await handleRequest(make('application/json', '{', ''), env, NOW)).status).toBe(401);
      env.SOCIAL_MODE = 'off';
      expect((await handleRequest(make('application/json', '{'), env, NOW)).status).toBe(503);
    } finally {
      await fx.dispose();
    }
  });

  it('계정 삭제는 소셜 투영만 함께 지우고 다른 두 계정은 유지한다', async () => {
    const fx = await createD1Fixture();
    try {
      const env = testEnv(fx.db);
      const a = await user(env, 'a');
      const oldA = await createSession(env, 'a', NOW);
      const b = await user(env, 'b');
      const c = await user(env, 'c');
      const ids: string[] = [];
      for (const [name, cookie] of [
        ['A', a],
        ['B', b],
        ['C', c],
      ]) {
        const response = await handleRequest(
          request('/profile', cookie, { nickname: name }),
          env,
          NOW,
        );
        ids.push(((await response.json()) as { data: { id: string } }).data.id);
      }
      await env.DB.prepare(
        `INSERT INTO social_pairs(lo,hi,state,requester,version)
        VALUES(MIN(?,?),MAX(?,?),'accepted',NULL,1)`,
      )
        .bind(ids[0], ids[1], ids[0], ids[1])
        .run();
      await env.DB.prepare(
        `INSERT INTO social_pairs(lo,hi,state,requester,version)
        VALUES(MIN(?,?),MAX(?,?),'accepted',NULL,1)`,
      )
        .bind(ids[1], ids[2], ids[1], ids[2])
        .run();
      await env.DB.prepare(
        `INSERT INTO social_posts(id,author,text,happened_on,created_at)
        VALUES(?,?,?,?,?)`,
      )
        .bind('0'.repeat(32), ids[0], 'text', '2026-01-01', Date.parse(NOW))
        .run();
      await env.DB.prepare(
        `INSERT INTO social_reactions(post_id,reactor,created_at)
        VALUES(?,?,?)`,
      )
        .bind('0'.repeat(32), ids[1], Date.parse(NOW))
        .run();
      const deleteReq = new Request(`${ORIGIN}/api/account/delete`, {
        method: 'POST',
        headers: { Cookie: a, 'X-Tasky': '1', 'Content-Type': 'application/json' },
        body: '{}',
      });
      expect((await handleRequest(deleteReq, env, NOW)).status).toBe(204);
      for (const table of ['social_profiles', 'social_posts', 'social_reactions']) {
        const count = await env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{
          n: number;
        }>();
        expect(count?.n).toBe(table === 'social_profiles' ? 2 : 0);
      }
      expect(
        (await env.DB.prepare('SELECT COUNT(*) AS n FROM social_pairs').first<{ n: number }>())?.n,
      ).toBe(1);
      const oldCookie = `tasky_session=${encodeURIComponent(oldA.signedSid)}`;
      expect((await handleRequest(request('/me', oldCookie), env, NOW)).status).toBe(410);
      const signed = await signIn(env, { sub: 'a', email: 'a@x.test' }, NOW);
      const newCookie = `tasky_session=${encodeURIComponent(signed.signedSid)}`;
      expect(await (await handleRequest(request('/me', newCookie), env, NOW)).json()).toMatchObject(
        { data: { profile: null } },
      );
      expect((await handleRequest(request('/friends', b), env, NOW)).status).toBe(200);
      expect((await handleRequest(request('/friends', c), env, NOW)).status).toBe(200);
    } finally {
      await fx.dispose();
    }
  });

  it('23경로의 effective mode를 실제 HTTP에서 검사한다', async () => {
    const fx = await createD1Fixture();
    try {
      const env = testEnv(fx.db);
      const cookie = await user(env, 'a');
      await handleRequest(request('/profile', cookie, { nickname: 'A' }), env, NOW);
      for (const mode of ['off', 'read-only', 'enabled'] as const) {
        env.SOCIAL_MODE = mode;
        for (const route of SOCIAL_ROUTES) {
          const req = new Request(
            `${ORIGIN}${route.path}${
              route.path.endsWith('/requests') && route.method === 'GET'
                ? '?direction=incoming'
                : ''
            }`,
            {
              method: route.method,
              headers: {
                Cookie: cookie,
                ...(route.method === 'POST'
                  ? {
                      Origin: ORIGIN,
                      'X-Tasky': '1',
                      'Content-Type': 'application/json',
                      'Idempotency-Key': KEY(99),
                    }
                  : {}),
              },
              ...(route.method === 'POST' ? { body: '{}' } : {}),
            },
          );
          const res = await handleRequest(req, env, NOW);
          const blocked =
            (route.minMode === 'enabled' && mode !== 'enabled') ||
            (route.minMode === 'read-only' && mode === 'off') ||
            (route.path === '/api/social/reactions/set' && mode !== 'enabled');
          expect(res.status === 503, `${mode} ${route.method} ${route.path}`).toBe(blocked);
        }
      }
    } finally {
      await fx.dispose();
    }
  }, 30_000);

  it('중복 삭제 경쟁에서 204는 첫 latch 한 번만 나온다', async () => {
    const fx = await createD1Fixture();
    try {
      const env = testEnv(fx.db);
      const cookie = await user(env, 'a');
      const make = () =>
        new Request(`${ORIGIN}/api/account/delete`, {
          method: 'POST',
          headers: { Cookie: cookie, 'X-Tasky': '1', 'Content-Type': 'application/json' },
          body: '{}',
        });
      const result = await Promise.all([
        handleRequest(make(), env, NOW),
        handleRequest(make(), env, NOW),
      ]);
      expect(result.map((item) => item.status).filter((status) => status === 204)).toHaveLength(1);
      expect([401, 410]).toContain(result.find((item) => item.status !== 204)?.status);
    } finally {
      await fx.dispose();
    }
  });
});
