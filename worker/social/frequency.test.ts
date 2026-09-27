import { describe, expect, it } from 'vitest';

import { ACTOR_A, ACTOR_B, VECTOR_KEY, VECTOR_NOW } from '@/domain/social/social-vectors';

import { createSocialActor } from './actor';
import { renameProfile } from './commands';
import { createD1Fixture } from '../test/d1-harness';

const A = { ok: true as const, sub: 'user-a', sid: 'sid-a', expiresAt: '2099-01-01T00:00:00.000Z' };
const B = { ok: true as const, sub: 'user-b', sid: 'sid-b', expiresAt: '2099-01-01T00:00:00.000Z' };

async function seed(db: D1Database): Promise<void> {
  await db.batch([
    db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES (?,?,?)')
      .bind(A.sub, 'a@example.test', A.expiresAt),
    db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES (?,?,?)')
      .bind(B.sub, 'b@example.test', B.expiresAt),
    db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES (?,?,?,?)')
      .bind(A.sid, A.sub, '2020-01-01T00:00:00.000Z', A.expiresAt),
    db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES (?,?,?,?)')
      .bind(B.sid, B.sub, '2020-01-01T00:00:00.000Z', B.expiresAt),
    db
      .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (?,?,?,?,?)')
      .bind(ACTOR_A, A.sub, 'Alice', 0, VECTOR_NOW),
    db
      .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (?,?,?,?,?)')
      .bind(ACTOR_B, B.sub, 'Bob', 0, VECTOR_NOW),
  ]);
}

describe('social command frequency on real D1', () => {
  it('charges one frequency slot for validation, replay and conflict and no receipt on 429', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
      expect(
        await renameProfile(actor, VECTOR_KEY, { nickname: 'New', expectedVersion: 0 }),
      ).toMatchObject({ ok: true });
      expect(
        await renameProfile(actor, VECTOR_KEY, { nickname: 'New', expectedVersion: 0 }),
      ).toMatchObject({ ok: true });
      expect(
        await renameProfile(actor, VECTOR_KEY, { nickname: 'Different', expectedVersion: 0 }),
      ).toEqual({ ok: false, code: 'idempotency-conflict' });
      expect(await renameProfile(actor, 'bad', {})).toEqual({ ok: false, code: 'validation' });
      const used = await fx.db
        .prepare("SELECT count FROM social_limits WHERE subject = ? AND bucket = 'write'")
        .bind(`p:${ACTOR_A}`)
        .first<{ count: number }>();
      expect(used?.count).toBe(4);
      for (let i = 4; i < 60; i += 1) {
        expect(await renameProfile(actor, 'bad', {})).toEqual({ ok: false, code: 'validation' });
      }
      expect(
        await renameProfile(actor, VECTOR_KEY, { nickname: 'New', expectedVersion: 0 }),
      ).toEqual({ ok: false, code: 'rate-limited' });
      expect(
        (await fx.db.prepare('SELECT COUNT(*) AS n FROM social_commands').first<{ n: number }>())
          ?.n,
      ).toBe(1);
    } finally {
      await fx.dispose();
    }
  }, 30_000);
});
