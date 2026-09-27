import { describe, expect, it } from 'vitest';

import { ACTOR_A, ACTOR_B, VECTOR_KEY, VECTOR_NOW } from '@/domain/social/social-vectors';

import { createSocialActor } from './actor';
import { acceptPair } from './pair-command';
import { removeFriend } from './remove-friend';
import { createD1Fixture } from '../test/d1-harness';

const A = { ok: true as const, sub: 'user-a', sid: 'sid-a', expiresAt: '2099-01-01T00:00:00.000Z' };
const B = { ok: true as const, sub: 'user-b', sid: 'sid-b', expiresAt: '2099-01-01T00:00:00.000Z' };

describe('blocked pair result visibility', () => {
  it('returns unavailable for matching and stale versions in both block directions', async () => {
    for (const blocker of [ACTOR_A, ACTOR_B]) {
      const fx = await createD1Fixture();
      try {
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
            .prepare(
              'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (?,?,?,?,?)',
            )
            .bind(ACTOR_A, A.sub, 'Alice', 0, VECTOR_NOW),
          fx.db
            .prepare(
              'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (?,?,?,?,?)',
            )
            .bind(ACTOR_B, B.sub, 'Bob', 0, VECTOR_NOW),
          fx.db
            .prepare(
              'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES (?,?,?,?,?,?)',
            )
            .bind(ACTOR_A, ACTOR_B, 'pending', ACTOR_B, 3, VECTOR_NOW),
          fx.db
            .prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES (?,?,?)')
            .bind(blocker, blocker === ACTOR_A ? ACTOR_B : ACTOR_A, VECTOR_NOW),
        ]);
        const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
        for (const expectedVersion of [3, 2]) {
          const key =
            expectedVersion === 3
              ? VECTOR_KEY
              : `v1.${VECTOR_NOW}.00000000000000000000000000000022`;
          expect(await acceptPair(actor, key, { peerId: ACTOR_B, expectedVersion })).toEqual({
            ok: false,
            code: 'unavailable',
          });
          const pair = await fx.db
            .prepare('SELECT state,requester,version FROM social_pairs WHERE lo = ? AND hi = ?')
            .bind(ACTOR_A, ACTOR_B)
            .first<{ state: string; requester: string; version: number }>();
          expect(pair).toMatchObject({ state: 'pending', requester: ACTOR_B, version: 3 });
          const receipt = await fx.db
            .prepare('SELECT result_code FROM social_commands WHERE actor = ? AND key = ?')
            .bind(ACTOR_A, key)
            .first<{ result_code: string }>();
          expect(receipt?.result_code).toBe('unavailable');
        }
        await fx.db
          .prepare(
            "UPDATE social_pairs SET state = 'none',requester = NULL,requested_at = NULL WHERE lo = ? AND hi = ?",
          )
          .bind(ACTOR_A, ACTOR_B)
          .run();
        for (const expectedVersion of [3, 2]) {
          const key = `v1.${VECTOR_NOW}.0000000000000000000000000000003${expectedVersion}`;
          expect(await removeFriend(actor, key, { peerId: ACTOR_B, expectedVersion })).toEqual({
            ok: false,
            code: 'unavailable',
          });
          const pair = await fx.db
            .prepare('SELECT state,version FROM social_pairs WHERE lo = ? AND hi = ?')
            .bind(ACTOR_A, ACTOR_B)
            .first<{ state: string; version: number }>();
          expect(pair).toMatchObject({ state: 'none', version: 3 });
        }
      } finally {
        await fx.dispose();
      }
    }
  }, 15_000);
});
