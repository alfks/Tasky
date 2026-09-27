import { describe, expect, it } from 'vitest';

import { createSession } from '../auth/session';
import { createD1Fixture } from '../test/d1-harness';
import { createSocialActor } from './actor';
import { readSocialList } from './reads';

import type { Env } from '../env';

const NOW = 1_800_000_000_000;
const ISO = new Date(NOW).toISOString();
const ID = 'a'.padStart(32, '0');

describe('current-A guarded list', () => {
  for (const [loss, code] of [
    ['session', 'unauthorized'],
    ['marker', 'account-deleted'],
  ] as const)
    it(`목록 SELECT 직전 ${loss} 상실을 빈 200으로 바꾸지 않는다`, async () => {
      const fx = await createD1Fixture();
      try {
        const env = { DB: fx.db, SESSION_SECRET: 'secret' } as Env;
        await fx.db
          .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
          .bind('a', 'a@x.test', ISO)
          .run();
        await fx.db
          .prepare(
            `INSERT INTO social_profiles(id,sub,nickname,version,created_at)
        VALUES(?,?,?,0,?)`,
          )
          .bind(ID, 'a', 'A', NOW)
          .run();
        const signed = await createSession(env, 'a', ISO);
        const sid = signed.signedSid.split('.')[0];
        const actor = await createSocialActor(
          fx.db,
          { ok: true, sub: 'a', sid, expiresAt: new Date(NOW + 86_400_000).toISOString() },
          NOW,
        );
        let dropped = false;
        const db = {
          prepare: (query: string) => {
            if (!query.includes('FROM social_pairs pair JOIN social_profiles peer'))
              return fx.db.prepare(query);
            return {
              bind: (...values: unknown[]) => ({
                all: async () => {
                  if (loss === 'session')
                    await fx.db.prepare('DELETE FROM sessions WHERE sid = ?').bind(sid).run();
                  else
                    await fx.db
                      .prepare('INSERT INTO deleted_users(sub,deleted_at) VALUES(?,?)')
                      .bind('a', ISO)
                      .run();
                  dropped = true;
                  return fx.db
                    .prepare(query)
                    .bind(...values)
                    .all();
                },
              }),
            };
          },
        } as unknown as D1Database;
        const outcome = await readSocialList(
          { ...actor, db },
          '/api/social/friends',
          new URL('https://tasky.example/api/social/friends'),
        );
        expect(dropped).toBe(true);
        expect(outcome).toEqual({ ok: false, code });
      } finally {
        await fx.dispose();
      }
    });
});
