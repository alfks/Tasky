import { describe, expect, it } from 'vitest';

import { ACTOR_A, ACTOR_B, VECTOR_KEY, VECTOR_NOW } from '@/domain/social/social-vectors';

import { createSocialActor } from './actor';
import { consumeInvite } from './invite-command';
import { acceptPair } from './pair-command';
import { createD1Fixture } from '../test/d1-harness';

const A = { ok: true as const, sub: 'user-a', sid: 'sid-a', expiresAt: '2099-01-01T00:00:00.000Z' };
const B = { ok: true as const, sub: 'user-b', sid: 'sid-b', expiresAt: '2099-01-01T00:00:00.000Z' };
const WEEK = 7 * 86_400_000;
const TOKEN = 'a'.repeat(64);

async function fixture() {
  const fx = await createD1Fixture();
  await fx.db.batch([
    fx.db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES (?,?,?)')
      .bind(A.sub, 'a@example.test', A.expiresAt),
    fx.db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES (?,?,?)')
      .bind(B.sub, 'b@example.test', B.expiresAt),
    fx.db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES (?,?,?,?)')
      .bind(A.sid, A.sub, '2020-01-01T00:00:00.000Z', A.expiresAt),
    fx.db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES (?,?,?,?)')
      .bind(B.sid, B.sub, '2020-01-01T00:00:00.000Z', B.expiresAt),
    fx.db
      .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (?,?,?,?,?)')
      .bind(ACTOR_A, A.sub, 'Alice', 0, VECTOR_NOW),
    fx.db
      .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (?,?,?,?,?)')
      .bind(ACTOR_B, B.sub, 'Bob', 0, VECTOR_NOW),
  ]);
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(TOKEN)),
  );
  const hash = Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
  await fx.db
    .prepare(
      'INSERT INTO social_invites(hash,owner,expires_at,status,created_at) VALUES (?,?,?,?,?)',
    )
    .bind(hash, ACTOR_B, VECTOR_NOW + 86_400_000, 'active', VECTOR_NOW)
    .run();
  return { ...fx, hash };
}

async function pair(db: D1Database) {
  return db
    .prepare('SELECT state,requester,version FROM social_pairs WHERE lo = ? AND hi = ?')
    .bind(ACTOR_A, ACTOR_B)
    .first<{ state: string; requester: string | null; version: number }>();
}

describe('pending expiry in a real D1 transaction', () => {
  it('accepts one millisecond before, but expires exactly at the deadline', async () => {
    for (const offset of [1, 0, -1]) {
      const fx = await fixture();
      try {
        await fx.db
          .prepare(
            'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES (?,?,?,?,?,?)',
          )
          .bind(ACTOR_A, ACTOR_B, 'pending', ACTOR_B, 3, VECTOR_NOW - WEEK + offset)
          .run();
        const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
        const result = await acceptPair(actor, VECTOR_KEY, { peerId: ACTOR_B, expectedVersion: 3 });
        if (offset === 1) {
          expect(result).toEqual({
            ok: true,
            value: { resourceId: ACTOR_B, resultVersion: 4, didApply: true },
          });
          expect(await pair(fx.db)).toMatchObject({ state: 'accepted', version: 4 });
        } else {
          expect(result).toEqual({ ok: false, code: 'request-expired' });
          expect(await pair(fx.db)).toMatchObject({ state: 'none', version: 4 });
          expect(
            await acceptPair(actor, VECTOR_KEY, { peerId: ACTOR_B, expectedVersion: 3 }),
          ).toEqual({ ok: false, code: 'request-expired' });
          expect((await pair(fx.db))?.version).toBe(4);
        }
      } finally {
        await fx.dispose();
      }
    }
  }, 20_000);

  it('keeps stale, malformed, old-key, mismatched receipt and auth loss from cleaning', async () => {
    for (const variant of ['stale', 'malformed', 'old', 'mismatch', 'revoked']) {
      const fx = await fixture();
      try {
        await fx.db
          .prepare(
            'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES (?,?,?,?,?,?)',
          )
          .bind(ACTOR_A, ACTOR_B, 'pending', ACTOR_B, 3, VECTOR_NOW - WEEK)
          .run();
        const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
        if (variant === 'mismatch') {
          await fx.db
            .prepare(
              'INSERT INTO social_commands(actor,key,request_hash,execution_nonce,result_code,created_at) VALUES (?,?,?,?,?,?)',
            )
            .bind(ACTOR_A, VECTOR_KEY, 'different-hash', 'old-nonce', 'ok', VECTOR_NOW)
            .run();
        }
        if (variant === 'revoked')
          await fx.db.prepare('DELETE FROM sessions WHERE sid = ?').bind(A.sid).run();
        const key =
          variant === 'malformed'
            ? 'bad'
            : variant === 'old'
              ? `v1.${VECTOR_NOW - 86_400_001}.00000000000000000000000000000001`
              : VECTOR_KEY;
        const expectedVersion = variant === 'stale' ? 2 : 3;
        const observed = await acceptPair(actor, key, { peerId: ACTOR_B, expectedVersion });
        const code =
          variant === 'stale'
            ? 'conflict'
            : variant === 'malformed'
              ? 'validation'
              : variant === 'old'
                ? 'request-expired'
                : variant === 'mismatch'
                  ? 'idempotency-conflict'
                  : 'unauthorized';
        expect(observed).toEqual({ ok: false, code });
        expect(await pair(fx.db)).toMatchObject({ state: 'pending', version: 3 });
      } finally {
        await fx.dispose();
      }
    }
  }, 30_000);

  it('atomically cleans expired pending and consumes a new invite with version +2', async () => {
    for (const offset of [1, 0, -1]) {
      const fx = await fixture();
      try {
        await fx.db
          .prepare(
            'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES (?,?,?,?,?,?)',
          )
          .bind(ACTOR_A, ACTOR_B, 'pending', ACTOR_B, 3, VECTOR_NOW - WEEK + offset)
          .run();
        const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
        const result = await consumeInvite(actor, VECTOR_KEY, { token: TOKEN });
        if (offset === 1) {
          expect(result).toEqual({ ok: false, code: 'request-pending' });
          expect(await pair(fx.db)).toMatchObject({
            state: 'pending',
            requester: ACTOR_B,
            version: 3,
          });
          expect(
            (await fx.db.prepare('SELECT status FROM social_invites').first<{ status: string }>())
              ?.status,
          ).toBe('active');
        } else {
          expect(result).toEqual({
            ok: true,
            value: { resourceId: ACTOR_B, resultVersion: 5, didApply: true },
          });
          expect(await pair(fx.db)).toMatchObject({
            state: 'pending',
            requester: ACTOR_A,
            version: 5,
          });
          expect(
            (await fx.db.prepare('SELECT status FROM social_invites').first<{ status: string }>())
              ?.status,
          ).toBe('used');
          expect(await consumeInvite(actor, VECTOR_KEY, { token: TOKEN })).toMatchObject({
            ok: true,
            value: { didApply: false, resultVersion: 5 },
          });
          expect((await pair(fx.db))?.version).toBe(5);
        }
      } finally {
        await fx.dispose();
      }
    }
  }, 20_000);

  it('rolls back cleanup, invite and receipt when a middle SQL statement fails', async () => {
    const fx = await fixture();
    try {
      await fx.db
        .prepare(
          'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES (?,?,?,?,?,?)',
        )
        .bind(ACTOR_A, ACTOR_B, 'pending', ACTOR_B, 3, VECTOR_NOW - WEEK)
        .run();
      await fx.db
        .prepare(
          "CREATE TRIGGER fail_invite BEFORE UPDATE OF status ON social_invites BEGIN SELECT RAISE(ABORT,'forced'); END",
        )
        .run();
      const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
      await expect(consumeInvite(actor, VECTOR_KEY, { token: TOKEN })).rejects.toThrow();
      expect(await pair(fx.db)).toMatchObject({ state: 'pending', version: 3 });
      expect(
        (await fx.db.prepare('SELECT status FROM social_invites').first<{ status: string }>())
          ?.status,
      ).toBe('active');
      expect(
        (await fx.db.prepare('SELECT COUNT(*) AS n FROM social_commands').first<{ n: number }>())
          ?.n,
      ).toBe(0);
    } finally {
      await fx.dispose();
    }
  });

  it('keeps version and invite outcome under both accept/consume serial orders', async () => {
    for (const acceptFirst of [true, false]) {
      const fx = await fixture();
      try {
        await fx.db
          .prepare(
            'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES (?,?,?,?,?,?)',
          )
          .bind(ACTOR_A, ACTOR_B, 'pending', ACTOR_B, 3, VECTOR_NOW - WEEK)
          .run();
        const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
        const acceptKey = `v1.${VECTOR_NOW}.00000000000000000000000000000019`;
        if (acceptFirst) {
          expect(
            await acceptPair(actor, acceptKey, { peerId: ACTOR_B, expectedVersion: 3 }),
          ).toEqual({ ok: false, code: 'request-expired' });
        }
        expect(await consumeInvite(actor, VECTOR_KEY, { token: TOKEN })).toEqual({
          ok: true,
          value: { resourceId: ACTOR_B, resultVersion: 5, didApply: true },
        });
        if (!acceptFirst) {
          expect(
            await acceptPair(actor, acceptKey, { peerId: ACTOR_B, expectedVersion: 3 }),
          ).toEqual({ ok: false, code: 'conflict' });
        }
        expect(await pair(fx.db)).toMatchObject({
          state: 'pending',
          requester: ACTOR_A,
          version: 5,
        });
        expect(
          (await fx.db.prepare('SELECT status FROM social_invites').first<{ status: string }>())
            ?.status,
        ).toBe('used');
      } finally {
        await fx.dispose();
      }
    }
  }, 20_000);
});
