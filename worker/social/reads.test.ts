import { describe, expect, it } from 'vitest';

import { createSocialActor } from './actor';
import { readSocialList } from './reads';
import { createSession } from '../auth/session';
import { createD1Fixture } from '../test/d1-harness';

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
          'secret',
        );
        expect(dropped).toBe(true);
        expect(outcome).toEqual({ ok: false, code });
      } finally {
        await fx.dispose();
      }
    }, 15_000);

  it('0행 뒤 A 확인과 profile 재확인 사이 삭제 marker를 410으로 분류한다', async () => {
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
      const actor = await createSocialActor(
        fx.db,
        {
          ok: true,
          sub: 'a',
          sid: signed.signedSid.split('.')[0],
          expiresAt: new Date(NOW + 86_400_000).toISOString(),
        },
        NOW,
      );
      let profileReads = 0;
      const db = {
        prepare: (query: string) => {
          if (!query.includes('SELECT p.id, p.nickname, p.version FROM social_profiles p'))
            return fx.db.prepare(query);
          return {
            bind: (...values: unknown[]) => ({
              first: async () => {
                profileReads++;
                if (profileReads === 2)
                  await fx.db
                    .prepare('INSERT INTO deleted_users(sub,deleted_at) VALUES(?,?)')
                    .bind('a', ISO)
                    .run();
                return fx.db
                  .prepare(query)
                  .bind(...values)
                  .first();
              },
            }),
          };
        },
      } as unknown as D1Database;
      const outcome = await readSocialList(
        { ...actor, db },
        '/api/social/friends',
        new URL('https://tasky.example/api/social/friends'),
        'secret',
      );
      expect(profileReads).toBe(2);
      expect(outcome).toEqual({ ok: false, code: 'account-deleted' });
    } finally {
      await fx.dispose();
    }
  });

  it('친구 ID keyset 2페이지는 signed cursor를 쓰고 limit 변경에도 누락이 없다', async () => {
    const fx = await createD1Fixture();
    try {
      const env = { DB: fx.db, SESSION_SECRET: 'secret' } as Env;
      const ids = ['a', 'b', 'c', 'd'].map((char) => char.padStart(32, '0'));
      for (const [index, sub] of ['a', 'b', 'c', 'd'].entries()) {
        await fx.db
          .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
          .bind(sub, `${sub}@x.test`, ISO)
          .run();
        await fx.db
          .prepare(
            `INSERT INTO social_profiles(id,sub,nickname,version,created_at)
          VALUES(?,?,?,0,?)`,
          )
          .bind(ids[index], sub, sub, NOW)
          .run();
        if (index > 0)
          await fx.db
            .prepare(
              `INSERT INTO social_pairs(lo,hi,state,version)
            VALUES(?,?,'accepted',1)`,
            )
            .bind(ids[0], ids[index])
            .run();
      }
      const signed = await createSession(env, 'a', ISO);
      const actor = await createSocialActor(
        fx.db,
        {
          ok: true,
          sub: 'a',
          sid: signed.signedSid.split('.')[0],
          expiresAt: new Date(NOW + 86_400_000).toISOString(),
        },
        NOW,
      );
      const first = await readSocialList(
        actor,
        '/api/social/friends',
        new URL('https://tasky.example/api/social/friends?limit=2'),
        'secret',
      );
      expect(first.ok).toBe(true);
      if (!first.ok) throw Error('first page');
      expect(first.value.items).toMatchObject([{ id: ids[1] }, { id: ids[2] }]);
      expect(first.value.nextCursor).not.toBe(ids[2]);
      const next = new URL('https://tasky.example/api/social/friends');
      next.searchParams.set('cursor', first.value.nextCursor!);
      next.searchParams.set('limit', '1');
      const second = await readSocialList(actor, '/api/social/friends', next, 'secret');
      expect(second).toMatchObject({
        ok: true,
        value: {
          items: [{ id: ids[3] }],
          nextCursor: null,
        },
      });
      expect(await readSocialList(actor, '/api/social/blocks', next, 'secret')).toEqual({
        ok: false,
        code: 'validation',
      });
    } finally {
      await fx.dispose();
    }
  });
});
