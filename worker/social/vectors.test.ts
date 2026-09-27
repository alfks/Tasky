import { describe, expect, it } from 'vitest';

import {
  ACTOR_A,
  ACTOR_B,
  SOCIAL_COMMAND_VECTORS,
  SOCIAL_PAIR_VECTORS,
  SOCIAL_READ_VECTORS,
  VECTOR_KEY,
  VECTOR_NOW,
} from '@/domain/social/social-vectors';

import { createSocialActor, readVisiblePost } from './actor';
import { blockPeer } from './block-command';
import { renameProfile, requestHash } from './commands';
import { collectSocialGarbage } from './limits';
import { acceptPair } from './pair-command';
import { removeFriend } from './remove-friend';
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

describe('shared domain vectors observed through real D1', () => {
  it('compares every read vector with the actual SQL result', async () => {
    for (const vector of SOCIAL_READ_VECTORS) {
      const fx = await createD1Fixture();
      try {
        await seed(fx.db);
        await fx.db.batch([
          fx.db
            .prepare(
              'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES (?,?,?,?,?)',
            )
            .bind('post-a', ACTOR_A, 'mine', '2027-01-01', VECTOR_NOW),
          fx.db
            .prepare(
              'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES (?,?,?,?,?)',
            )
            .bind('post-b', ACTOR_B, 'peer', '2027-01-01', VECTOR_NOW),
        ]);
        if (vector.friendship.isAccepted) {
          await fx.db
            .prepare("INSERT INTO social_pairs(lo,hi,state,version) VALUES (?,?,'accepted',1)")
            .bind(ACTOR_A, ACTOR_B)
            .run();
        }
        if (vector.friendship.isBlockedByActor) {
          await fx.db
            .prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES (?,?,?)')
            .bind(ACTOR_A, ACTOR_B, VECTOR_NOW)
            .run();
        }
        if (vector.friendship.isBlockedByPeer) {
          await fx.db
            .prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES (?,?,?)')
            .bind(ACTOR_B, ACTOR_A, VECTOR_NOW)
            .run();
        }
        if (!vector.authorIsActive)
          await fx.db.prepare('DELETE FROM users WHERE sub = ?').bind(B.sub).run();
        if (!vector.actor.isSessionActive)
          await fx.db.prepare('DELETE FROM sessions WHERE sid = ?').bind(A.sid).run();
        if (!vector.actor.isAccountActive) {
          await fx.db
            .prepare('INSERT INTO deleted_users(sub,deleted_at) VALUES (?,?)')
            .bind(A.sub, A.expiresAt)
            .run();
        }
        const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
        const observed = await readVisiblePost(
          actor,
          vector.authorId === ACTOR_A ? 'post-a' : 'post-b',
        );
        expect(observed.ok ? 'allowed' : observed.code, vector.name).toBe(vector.expected);
      } finally {
        await fx.dispose();
      }
    }
  }, 35_000);

  it('compares selected pair vectors with actual command outcome and state', async () => {
    const cases = SOCIAL_PAIR_VECTORS.filter((vector) =>
      [
        'R5 수신자만 수락',
        'R5 발신자 수락 불가',
        'R5 stale 수락은 version 불변',
        'R5 차단 actor의 stale 수락 비노출',
        'R5 차단 peer의 matching 수락 비노출',
        'R5 친구 삭제는 none tombstone과 반응 삭제',
        'R5 차단된 none 친구 삭제 비노출',
        'R6 차단은 pair 없어도 version 증가',
        'R4 만료 요청은 수락 불가',
      ].includes(vector.name),
    );
    expect(cases.length).toBe(9);
    for (const vector of cases) {
      const fx = await createD1Fixture();
      try {
        await seed(fx.db);
        const pair = vector.facts.pair;
        if (pair !== undefined) {
          await fx.db
            .prepare(
              'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES (?,?,?,?,?,?)',
            )
            .bind(pair.lo, pair.hi, pair.state, pair.requesterId, pair.version, pair.requestedAt)
            .run();
        }
        if (vector.facts.isBlockedByActor || vector.facts.isBlockedByPeer) {
          await fx.db
            .prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES (?,?,?)')
            .bind(
              vector.facts.isBlockedByActor ? ACTOR_A : ACTOR_B,
              vector.facts.isBlockedByActor ? ACTOR_B : ACTOR_A,
              VECTOR_NOW,
            )
            .run();
        }
        const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
        const dto = { peerId: ACTOR_B, expectedVersion: vector.facts.expectedVersion ?? 0 };
        const result =
          vector.facts.action === 'remove'
            ? await removeFriend(actor, VECTOR_KEY, dto)
            : vector.facts.action === 'block'
              ? await blockPeer(actor, VECTOR_KEY, { peerId: ACTOR_B, blocked: true })
              : await acceptPair(actor, VECTOR_KEY, dto);
        expect(result.ok ? 'ok' : result.code, vector.name).toBe(
          vector.expected.ok ? 'ok' : vector.expected.code,
        );
        const row = await fx.db
          .prepare('SELECT state,version FROM social_pairs WHERE lo = ? AND hi = ?')
          .bind(ACTOR_A, ACTOR_B)
          .first<{ state: string; version: number }>();
        if (vector.expected.ok) {
          expect(row, vector.name).toMatchObject({
            state: vector.expected.pair.state,
            version: vector.expected.pair.version,
          });
        } else if (vector.name !== 'R4 만료 요청은 수락 불가') {
          expect(row?.version, vector.name).toBe(pair?.version);
        } else {
          expect(row, vector.name).toMatchObject({
            state: 'none',
            version: (pair?.version ?? 0) + 1,
          });
        }
      } finally {
        await fx.dispose();
      }
    }
  }, 30_000);

  it('compares command replay, conflict, expiry and revoked access with D1 receipts', async () => {
    const cases = SOCIAL_COMMAND_VECTORS;
    expect(cases.length).toBeGreaterThanOrEqual(8);
    for (const vector of cases) {
      const fx = await createD1Fixture();
      try {
        await seed(fx.db);
        const isOther = vector.actor.actorId === ACTOR_B;
        const session = isOther ? B : A;
        const actorId = isOther ? ACTOR_B : ACTOR_A;
        const dto = { nickname: 'Changed', expectedVersion: 0 };
        const normalHash = await requestHash('POST', '/api/social/profile/name', dto);
        if (vector.receipt !== undefined) {
          await fx.db
            .prepare(
              'INSERT INTO social_commands(actor,key,request_hash,execution_nonce,result_code,resource_id,result_version,created_at) VALUES (?,?,?,?,?,?,?,?)',
            )
            .bind(ACTOR_A, vector.key, normalHash, 'prior', 'ok', ACTOR_A, 1, VECTOR_NOW - 60_000)
            .run();
        }
        if (!vector.actor.isSessionActive)
          await fx.db.prepare('DELETE FROM sessions WHERE sid = ?').bind(session.sid).run();
        if (!vector.actor.isAccountActive) {
          await fx.db
            .prepare('INSERT INTO deleted_users(sub,deleted_at) VALUES (?,?)')
            .bind(session.sub, A.expiresAt)
            .run();
        }
        const actor = await createSocialActor(fx.db, session, VECTOR_NOW);
        const request =
          vector.expected === 'idempotency-conflict'
            ? { nickname: 'Different', expectedVersion: 0 }
            : dto;
        const observed = await renameProfile(actor, vector.key, request);
        const result = observed.ok
          ? observed.value.didApply
            ? 'execute'
            : 'replay'
          : observed.code;
        expect(result, vector.name).toBe(vector.expected);
        if (vector.expected === 'execute') {
          expect(
            (
              await fx.db
                .prepare('SELECT version FROM social_profiles WHERE id = ?')
                .bind(actorId)
                .first<{ version: number }>()
            )?.version,
          ).toBe(1);
        }
        if (vector.name.includes('48시간 GC')) {
          expect(await collectSocialGarbage(fx.db, VECTOR_NOW)).toBe(0);
        }
      } finally {
        await fx.dispose();
      }
    }
  }, 40_000);

  it('honors inclusive 24h/5m key bounds and 48h receipt GC', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
      const keys = [
        `v1.${VECTOR_NOW - 86_400_000}.00000000000000000000000000000011`,
        `v1.${VECTOR_NOW + 300_000}.00000000000000000000000000000012`,
      ];
      for (const key of keys) {
        const version = key === keys[0] ? 0 : 1;
        expect(
          (await renameProfile(actor, key, { nickname: 'New', expectedVersion: version })).ok,
        ).toBe(true);
      }
      expect(
        await renameProfile(
          actor,
          `v1.${VECTOR_NOW - 86_400_001}.00000000000000000000000000000013`,
          { nickname: 'Old', expectedVersion: 2 },
        ),
      ).toEqual({ ok: false, code: 'request-expired' });
      expect(
        await renameProfile(actor, `v1.${VECTOR_NOW + 300_001}.00000000000000000000000000000014`, {
          nickname: 'Future',
          expectedVersion: 2,
        }),
      ).toEqual({ ok: false, code: 'request-expired' });
      const hash = await requestHash('POST', '/api/social/profile/name', {
        nickname: 'Replay',
        expectedVersion: 2,
      });
      const oldKey = `v1.${VECTOR_NOW - 49 * 3_600_000}.00000000000000000000000000000015`;
      await fx.db
        .prepare(
          'INSERT INTO social_commands(actor,key,request_hash,execution_nonce,result_code,resource_id,result_version,created_at) VALUES (?,?,?,?,?,?,?,?)',
        )
        .bind(ACTOR_A, oldKey, hash, 'prior', 'ok', ACTOR_A, 3, VECTOR_NOW - 172_800_000 + 1)
        .run();
      expect(await collectSocialGarbage(fx.db, VECTOR_NOW)).toBe(0);
      expect(
        await renameProfile(actor, oldKey, { nickname: 'Replay', expectedVersion: 2 }),
      ).toEqual({ ok: true, value: { resourceId: ACTOR_A, resultVersion: 3, didApply: false } });
      await fx.db
        .prepare('UPDATE social_commands SET created_at = ? WHERE actor = ? AND key = ?')
        .bind(VECTOR_NOW - 172_800_000, ACTOR_A, oldKey)
        .run();
      expect(await collectSocialGarbage(fx.db, VECTOR_NOW)).toBe(1);
      expect(
        await renameProfile(actor, oldKey, { nickname: 'Replay', expectedVersion: 2 }),
      ).toEqual({ ok: false, code: 'request-expired' });
    } finally {
      await fx.dispose();
    }
  }, 15_000);
});
