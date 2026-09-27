import { describe, expect, it } from 'vitest';

import { ACTOR_A, ACTOR_B, VECTOR_KEY, VECTOR_NOW } from '@/domain/social/social-vectors';

import { createProfile, createSocialActor } from './actor';
import { blockPeer } from './block-command';
import { consumeInvite, previewInvite } from './invite-command';
import { collectSocialGarbage, limitSubject, reserveLimit } from './limits';
import { acceptPair } from './pair-command';
import { removeFriend } from './remove-friend';
import { createD1Fixture } from '../test/d1-harness';

const A = { ok: true as const, sub: 'user-a', sid: 'sid-a', expiresAt: '2099-01-01T00:00:00.000Z' };
const B = { ok: true as const, sub: 'user-b', sid: 'sid-b', expiresAt: '2099-01-01T00:00:00.000Z' };

async function seed(db: D1Database): Promise<void> {
  await db.batch([
    db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES (?, ?, ?)')
      .bind(A.sub, 'a@example.test', A.expiresAt),
    db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES (?, ?, ?)')
      .bind(B.sub, 'b@example.test', B.expiresAt),
    db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES (?, ?, ?, ?)')
      .bind(A.sid, A.sub, '2020-01-01T00:00:00.000Z', A.expiresAt),
    db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES (?, ?, ?, ?)')
      .bind(B.sid, B.sub, '2020-01-01T00:00:00.000Z', B.expiresAt),
  ]);
}

async function seedProfiles(db: D1Database): Promise<void> {
  await db.batch([
    db
      .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (?,?,?,?,?)')
      .bind(ACTOR_A, A.sub, 'Alice', 0, VECTOR_NOW),
    db
      .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (?,?,?,?,?)')
      .bind(ACTOR_B, B.sub, 'Bob', 0, VECTOR_NOW),
  ]);
}

async function count(db: D1Database, table: string): Promise<number> {
  const allowed = [
    'social_profiles',
    'social_posts',
    'social_commands',
    'social_reactions',
    'social_limits',
    'users',
  ];
  if (!allowed.includes(table)) throw new Error('Unexpected table');
  const row = await db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>();
  return row?.n ?? -1;
}

describe('Phase 3 social relations', () => {
  it('applies fixed UTC windows and bounded GC', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
      const pre = await limitSubject(actor, 'secret', 'pre');
      expect(pre).toMatch(/^pre:[0-9a-f]{64}$/u);
      if (pre === null) throw new Error('subject missing');
      for (let i = 0; i < 20; i += 1) expect(await reserveLimit(actor, pre, 'preview')).toBe(true);
      expect(await reserveLimit(actor, pre, 'preview')).toBe(false);
      expect(await count(fx.db, 'social_limits')).toBe(1);
      expect(await collectSocialGarbage(fx.db, VECTOR_NOW + 3 * 86_400_000)).toBe(1);
    } finally {
      await fx.dispose();
    }
  });

  it('accepts a pending pair once across both serial orders and expires stale pending', async () => {
    for (const reverse of [false, true]) {
      const fx = await createD1Fixture();
      try {
        await seed(fx.db);
        await seedProfiles(fx.db);
        await fx.db
          .prepare(
            'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES (?,?,?,?,?,?)',
          )
          .bind(ACTOR_A, ACTOR_B, 'pending', ACTOR_B, 3, VECTOR_NOW - 1000)
          .run();
        const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
        const firstKey = VECTOR_KEY;
        const secondKey = `v1.${VECTOR_NOW}.00000000000000000000000000000003`;
        const requests = reverse ? [secondKey, firstKey] : [firstKey, secondKey];
        const first = await acceptPair(actor, requests[0], { peerId: ACTOR_B, expectedVersion: 3 });
        const second = await acceptPair(actor, requests[1], {
          peerId: ACTOR_B,
          expectedVersion: 3,
        });
        expect(first).toEqual({
          ok: true,
          value: { resourceId: ACTOR_B, resultVersion: 4, didApply: true },
        });
        expect(second).toEqual({ ok: false, code: 'conflict' });
        expect(
          (
            await fx.db
              .prepare('SELECT version FROM social_pairs WHERE lo = ?')
              .bind(ACTOR_A)
              .first<{ version: number }>()
          )?.version,
        ).toBe(4);
        expect(
          await acceptPair(actor, requests[0], { peerId: ACTOR_B, expectedVersion: 3 }),
        ).toEqual({ ok: true, value: { resourceId: ACTOR_B, resultVersion: 4, didApply: false } });
        await fx.db
          .prepare(
            'UPDATE social_pairs SET state = ?,requester = ?,requested_at = ?,version = ? WHERE lo = ?',
          )
          .bind('pending', ACTOR_B, VECTOR_NOW - 8 * 86_400_000, 5, ACTOR_A)
          .run();
        const expiryKey = `v1.${VECTOR_NOW}.00000000000000000000000000000007`;
        expect(await acceptPair(actor, expiryKey, { peerId: ACTOR_B, expectedVersion: 5 })).toEqual(
          { ok: false, code: 'request-expired' },
        );
        expect(
          await fx.db
            .prepare('SELECT state,version FROM social_pairs WHERE lo = ?')
            .bind(ACTOR_A)
            .first<{ state: string; version: number }>(),
        ).toMatchObject({ state: 'none', version: 6 });
      } finally {
        await fx.dispose();
      }
    }
  }, 20_000);

  it('previews before profile and consumes an invite once with the pair', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      await fx.db
        .prepare(
          'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (?,?,?,?,?)',
        )
        .bind(ACTOR_B, B.sub, 'Bob', 0, VECTOR_NOW)
        .run();
      const token = 'a'.repeat(64);
      const bytes = new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
      );
      const hash = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
      await fx.db
        .prepare(
          'INSERT INTO social_invites(hash,owner,expires_at,status,created_at) VALUES (?,?,?,?,?)',
        )
        .bind(hash, ACTOR_B, VECTOR_NOW + 86_400_000, 'active', VECTOR_NOW)
        .run();
      const before = await createSocialActor(fx.db, A, VECTOR_NOW);
      expect(before.profileId).toBeNull();
      expect(await previewInvite(before, 'secret', { token })).toEqual({
        ok: true,
        value: { nickname: 'Bob', expiresAt: VECTOR_NOW + 86_400_000 },
      });
      const created = await createProfile(before, 'Alice');
      expect(created.ok).toBe(true);
      const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
      const first = await consumeInvite(actor, VECTOR_KEY, { token });
      expect(first).toEqual({
        ok: true,
        value: { resourceId: ACTOR_B, resultVersion: 1, didApply: true },
      });
      expect(await consumeInvite(actor, VECTOR_KEY, { token })).toEqual({
        ok: true,
        value: { resourceId: ACTOR_B, resultVersion: 1, didApply: false },
      });
      expect(
        await fx.db
          .prepare('SELECT status,used_by FROM social_invites WHERE hash = ?')
          .bind(hash)
          .first<{ status: string; used_by: string }>(),
      ).toMatchObject({ status: 'used', used_by: actor.profileId });
      expect(
        await fx.db
          .prepare('SELECT state,version FROM social_pairs')
          .first<{ state: string; version: number }>(),
      ).toMatchObject({ state: 'pending', version: 1 });
      expect(
        await consumeInvite(actor, `v1.${VECTOR_NOW}.00000000000000000000000000000008`, { token }),
      ).toEqual({ ok: false, code: 'unavailable' });
    } finally {
      await fx.dispose();
    }
  }, 15_000);

  it('removes a friend and both directions of reaction without stale retry effects', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      await seedProfiles(fx.db);
      await fx.db
        .prepare("INSERT INTO social_pairs(lo,hi,state,version) VALUES (?,?,'accepted',3)")
        .bind(ACTOR_A, ACTOR_B)
        .run();
      await fx.db.batch([
        fx.db
          .prepare(
            'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES (?,?,?,?,?)',
          )
          .bind('post-a', ACTOR_A, 'a', '2027-01-01', VECTOR_NOW),
        fx.db
          .prepare(
            'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES (?,?,?,?,?)',
          )
          .bind('post-b', ACTOR_B, 'b', '2027-01-01', VECTOR_NOW),
      ]);
      await fx.db.batch([
        fx.db
          .prepare('INSERT INTO social_reactions(post_id,reactor,created_at) VALUES (?,?,?)')
          .bind('post-a', ACTOR_B, VECTOR_NOW),
        fx.db
          .prepare('INSERT INTO social_reactions(post_id,reactor,created_at) VALUES (?,?,?)')
          .bind('post-b', ACTOR_A, VECTOR_NOW),
      ]);
      const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
      const result = await removeFriend(actor, VECTOR_KEY, { peerId: ACTOR_B, expectedVersion: 3 });
      expect(result).toEqual({
        ok: true,
        value: { resourceId: ACTOR_B, resultVersion: 4, didApply: true },
      });
      expect(await count(fx.db, 'social_reactions')).toBe(0);
      expect(
        await fx.db
          .prepare('SELECT state,version FROM social_pairs')
          .first<{ state: string; version: number }>(),
      ).toMatchObject({ state: 'none', version: 4 });
      expect(
        await removeFriend(actor, VECTOR_KEY, { peerId: ACTOR_B, expectedVersion: 3 }),
      ).toEqual({ ok: true, value: { resourceId: ACTOR_B, resultVersion: 4, didApply: false } });
    } finally {
      await fx.dispose();
    }
  });

  it('blocks without a prior pair and advances its tombstone version', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      await seedProfiles(fx.db);
      const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
      expect(await blockPeer(actor, VECTOR_KEY, { peerId: ACTOR_B, blocked: true })).toEqual({
        ok: true,
        value: { resourceId: ACTOR_B, resultVersion: 1, didApply: true },
      });
      expect(
        await fx.db
          .prepare('SELECT state,version FROM social_pairs')
          .first<{ state: string; version: number }>(),
      ).toMatchObject({ state: 'none', version: 1 });
      expect(
        (await fx.db.prepare('SELECT blocker FROM social_blocks').first<{ blocker: string }>())
          ?.blocker,
      ).toBe(ACTOR_A);
      expect(await blockPeer(actor, VECTOR_KEY, { peerId: ACTOR_B, blocked: true })).toEqual({
        ok: true,
        value: { resourceId: ACTOR_B, resultVersion: 1, didApply: false },
      });
      const newKey = `v1.${VECTOR_NOW}.00000000000000000000000000000006`;
      expect(await blockPeer(actor, newKey, { peerId: ACTOR_B, blocked: true })).toEqual({
        ok: true,
        value: { resourceId: ACTOR_B, resultVersion: 2, didApply: true },
      });
    } finally {
      await fx.dispose();
    }
  });
});
