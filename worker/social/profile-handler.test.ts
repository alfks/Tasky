import { describe, expect, it } from 'vitest';

import { createSession } from '../auth/session';
import { handleRequest } from '../router';
import { createD1Fixture } from '../test/d1-harness';

import type { Env } from '../env';

const NOW = '2026-01-01T00:00:00.000Z';
const ORIGIN = 'https://tasky.example.workers.dev';

async function setup(db: D1Database) {
  const env = {
    DB: db,
    ASSETS: {} as Fetcher,
    GOOGLE_CLIENT_ID: 'x',
    GOOGLE_CLIENT_SECRET: 'x',
    SESSION_SECRET: 'secret',
    SOCIAL_MODE: 'enabled',
    SOCIAL_ALLOWLIST: '["a"]',
  } as Env;
  await db
    .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
    .bind('a', 'a@x.test', NOW)
    .run();
  const signed = await createSession(env, 'a', NOW);
  return {
    env,
    sid: signed.signedSid.split('.')[0],
    cookie: `tasky_session=${encodeURIComponent(signed.signedSid)}`,
  };
}

describe('social profile HTTP', () => {
  it('동시 생성은 실제 INSERT 한 건만 201이고 공개 DTO에 내부 상태가 없다', async () => {
    const fx = await createD1Fixture();
    try {
      const { env, cookie } = await setup(fx.db);
      const make = () =>
        new Request(`${ORIGIN}/api/social/profile`, {
          method: 'POST',
          headers: {
            Cookie: cookie,
            Origin: ORIGIN,
            'X-Tasky': '1',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ nickname: 'A' }),
        });
      const responses = await Promise.all([
        handleRequest(make(), env, NOW),
        handleRequest(make(), env, NOW),
      ]);
      expect(responses.map((res) => res.status).sort()).toEqual([200, 201]);
      const bodies = (await Promise.all(responses.map((res) => res.json()))) as {
        data: Record<string, unknown>;
      }[];
      expect(bodies[0].data).toEqual(bodies[1].data);
      expect(Object.keys(bodies[0].data).sort()).toEqual(['id', 'nickname', 'version']);
    } finally {
      await fx.dispose();
    }
  });

  it('me의 첫 A 판정 직후 sid가 취소되면 profile:null 200을 내지 않는다', async () => {
    const fx = await createD1Fixture();
    try {
      const { env, sid, cookie } = await setup(fx.db);
      let dropped = false;
      env.DB = {
        prepare: (query: string) => {
          if (!query.includes('SELECT 1 AS live FROM sessions')) return fx.db.prepare(query);
          return {
            bind: (...values: unknown[]) => ({
              first: async () => {
                const row = await fx.db
                  .prepare(query)
                  .bind(...values)
                  .first();
                if (!dropped && row) {
                  dropped = true;
                  await fx.db.prepare('DELETE FROM sessions WHERE sid = ?').bind(sid).run();
                }
                return row;
              },
            }),
          };
        },
      } as unknown as D1Database;
      const res = await handleRequest(
        new Request(`${ORIGIN}/api/social/me`, {
          headers: { Cookie: cookie },
        }),
        env,
        NOW,
      );
      expect(dropped).toBe(true);
      expect(res.status).toBe(401);
      expect(await res.json()).toMatchObject({ error: { code: 'unauthorized' } });
    } finally {
      await fx.dispose();
    }
  });
});
