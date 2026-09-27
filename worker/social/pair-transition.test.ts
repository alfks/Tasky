import { describe, expect, it } from 'vitest';

import { createSocialActor } from './actor';
import { transitionPair } from './pair-transition';
import { createSession } from '../auth/session';
import { createD1Fixture } from '../test/d1-harness';

import type { Env } from '../env';

const NOW = 1_800_000_000_000;
const ISO = new Date(NOW).toISOString();
const A = 'a'.padStart(32, '0');
const B = 'b'.padStart(32, '0');
const key = (n: number, at = NOW) => `v1.${at}.${n.toString(16).padStart(32, '0')}`;

async function seed(db: D1Database) {
  const env = { DB: db, SESSION_SECRET: 'secret' } as Env;
  for (const [sub, id] of [
    ['a', A],
    ['b', B],
  ]) {
    await db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
      .bind(sub, `${sub}@x.test`, ISO)
      .run();
    await db
      .prepare(
        `INSERT INTO social_profiles(id,sub,nickname,version,created_at)
      VALUES(?,?,?,0,?)`,
      )
      .bind(id, sub, sub, NOW)
      .run();
  }
  const signed = await createSession(env, 'b', ISO);
  const session = {
    ok: true as const,
    sub: 'b',
    sid: signed.signedSid.split('.')[0],
    expiresAt: new Date(NOW + 86_400_000).toISOString(),
  };
  const actor = await createSocialActor(db, session, NOW);
  const reset = async () => {
    await db.prepare('DELETE FROM social_pairs').run();
    await db
      .prepare(
        `INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at)
      VALUES(?,?,'pending',?,1,?)`,
      )
      .bind(A, B, A, NOW - 604_800_001)
      .run();
  };
  const pair = () =>
    db
      .prepare('SELECT state,version FROM social_pairs WHERE lo = ? AND hi = ?')
      .bind(A, B)
      .first<{ state: string; version: number }>();
  return { actor, reset, pair, db };
}

describe('expired pending revocation', () => {
  it('새 정확한 decline만 nonce 한 번으로 tombstone을 쓴다', async () => {
    const fx = await createD1Fixture();
    try {
      const { actor, reset, pair, db } = await seed(fx.db);
      await reset();
      const dto = { peerId: A, expectedVersion: 1 };
      expect(await transitionPair(actor, key(1), dto, 'decline')).toMatchObject({
        ok: false,
        code: 'request-expired',
      });
      expect(await pair()).toMatchObject({ state: 'none', version: 2 });
      expect(await transitionPair(actor, key(1), dto, 'decline')).toMatchObject({
        ok: false,
        code: 'request-expired',
      });
      expect(await pair()).toMatchObject({ state: 'none', version: 2 });
      expect(
        (
          await db
            .prepare(`SELECT COUNT(*) AS n FROM social_commands WHERE actor = ?`)
            .bind(B)
            .first<{ n: number }>()
        )?.n,
      ).toBe(1);
    } finally {
      await fx.dispose();
    }
  });

  it('잘못된 requester·stale CAS·옛 key·인증 상실은 pair를 바꾸지 않는다', async () => {
    const fx = await createD1Fixture();
    try {
      const { actor, reset, pair, db } = await seed(fx.db);
      await reset();
      expect(
        await transitionPair(actor, key(2), { peerId: A, expectedVersion: 1 }, 'cancel'),
      ).toMatchObject({ ok: false, code: 'request-expired' });
      expect(await pair()).toMatchObject({ state: 'pending', version: 1 });
      expect(
        await transitionPair(actor, key(3), { peerId: A, expectedVersion: 0 }, 'decline'),
      ).toMatchObject({ ok: false, code: 'conflict' });
      expect(
        await transitionPair(
          actor,
          key(4, NOW - 86_400_001),
          { peerId: A, expectedVersion: 1 },
          'decline',
        ),
      ).toMatchObject({ ok: false, code: 'request-expired' });
      await db.prepare('DELETE FROM sessions WHERE sid = ?').bind(actor.sid).run();
      expect(
        await transitionPair(actor, key(5), { peerId: A, expectedVersion: 1 }, 'decline'),
      ).toMatchObject({ ok: false, code: 'unauthorized' });
      expect(await pair()).toMatchObject({ state: 'pending', version: 1 });
    } finally {
      await fx.dispose();
    }
  });
});
