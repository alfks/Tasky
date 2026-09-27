import { describe, expect, it } from 'vitest';

import { ACTOR_A, ACTOR_B, VECTOR_KEY, VECTOR_NOW } from '@/domain/social/social-vectors';

import { createProfile, createSocialActor, visiblePost } from './actor';
import { blockPeer } from './block-command';
import { renameProfile } from './commands';
import { deleteAccountProjection } from './deletion';
import { consumeInvite, previewInvite } from './invite-command';
import { collectSocialGarbage, limitSubject, reserveLimit } from './limits';
import { acceptPair, expirePendingPair } from './pair-command';
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

describe('Phase 3 D1 projection', () => {
  it('applies every migration with constraints and leaves personal sync data intact', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      await fx.db
        .prepare(
          'INSERT INTO entities(sub,tbl,id,seq,device_id,updated_at,body) VALUES (?,?,?,?,?,?,?)',
        )
        .bind(A.sub, 'todos', 'todo-1', 1, 'device-a', '2020-01-01T00:00:00.000Z', '{}')
        .run();
      const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
      const created = await createProfile(actor, ' Alice ');
      expect(created.ok && created.value.nickname).toBe('Alice');
      if (!created.ok) throw new Error('profile creation failed');
      expect((await createProfile(actor, 'Changed')).ok).toBe(true);
      expect(await count(fx.db, 'social_profiles')).toBe(1);
      expect(
        (
          await fx.db
            .prepare('SELECT body FROM entities WHERE sub = ?')
            .bind(A.sub)
            .first<{ body: string }>()
        )?.body,
      ).toBe('{}');
      await fx.db
        .prepare(
          'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (?,?,?,?,?)',
        )
        .bind(ACTOR_B, B.sub, 'Bob', 0, VECTOR_NOW)
        .run();
      const lo = created.value.id < ACTOR_B ? created.value.id : ACTOR_B;
      const hi = created.value.id < ACTOR_B ? ACTOR_B : created.value.id;
      await expect(
        fx.db
          .prepare(
            'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES (?,?,?,?,?,?)',
          )
          .bind(lo, hi, 'pending', null, 1, VECTOR_NOW)
          .run(),
      ).rejects.toThrow();
      await expect(
        fx.db
          .prepare('INSERT INTO social_pairs(lo,hi,state,version) VALUES (?,?,?,0)')
          .bind(hi, lo, 'none')
          .run(),
      ).rejects.toThrow();
      const indexes = await fx.db
        .prepare("SELECT name FROM sqlite_master WHERE type='index' AND name LIKE 'social_%'")
        .all<{ name: string }>();
      expect(indexes.results.some((row) => row.name === 'social_posts_author_created_id')).toBe(
        true,
      );
    } finally {
      await fx.dispose();
    }
  }, 15_000);

  it('reads real D1 state using the shared access vectors', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      await seedProfiles(fx.db);
      await fx.db
        .prepare(
          'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES (?,?,?,?,?)',
        )
        .bind('post-a', ACTOR_A, 'mine', '2027-01-01', VECTOR_NOW)
        .run();
      await fx.db
        .prepare(
          'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES (?,?,?,?,?)',
        )
        .bind('post-b', ACTOR_B, 'friend', '2027-01-01', VECTOR_NOW)
        .run();
      const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
      expect((await visiblePost(actor, 'post-a'))?.text).toBe('mine');
      expect(await visiblePost(actor, 'post-b')).toBeNull();
      await fx.db
        .prepare("INSERT INTO social_pairs(lo,hi,state,version) VALUES (?,?, 'accepted', 1)")
        .bind(ACTOR_A, ACTOR_B)
        .run();
      expect((await visiblePost(actor, 'post-b'))?.text).toBe('friend');
      await fx.db
        .prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES (?,?,?)')
        .bind(ACTOR_B, ACTOR_A, VECTOR_NOW)
        .run();
      expect(await visiblePost(actor, 'post-b')).toBeNull();
      await fx.db.prepare('DELETE FROM social_blocks WHERE blocker = ?').bind(ACTOR_B).run();
      await fx.db.prepare('DELETE FROM sessions WHERE sid = ?').bind(A.sid).run();
      expect(await visiblePost(actor, 'post-b')).toBeNull();
    } finally {
      await fx.dispose();
    }
  });

  it('keeps command receipt and effect atomic, and replays without increment', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      await seedProfiles(fx.db);
      const actor = await createSocialActor(fx.db, A, VECTOR_NOW);
      const input = { nickname: 'New', expectedVersion: 0 };
      const first = await renameProfile(actor, VECTOR_KEY, input);
      expect(first).toEqual({
        ok: true,
        value: { resourceId: ACTOR_A, resultVersion: 1, didApply: true },
      });
      expect(await renameProfile(actor, VECTOR_KEY, input)).toEqual({
        ok: true,
        value: { resourceId: ACTOR_A, resultVersion: 1, didApply: false },
      });
      expect(
        (
          await fx.db
            .prepare('SELECT version FROM social_profiles WHERE id = ?')
            .bind(ACTOR_A)
            .first<{ version: number }>()
        )?.version,
      ).toBe(1);
      expect(
        await renameProfile(actor, VECTOR_KEY, { nickname: 'Other', expectedVersion: 0 }),
      ).toEqual({ ok: false, code: 'idempotency-conflict' });
      const staleKey = `v1.${VECTOR_NOW}.00000000000000000000000000000009`;
      expect(await renameProfile(actor, staleKey, input)).toEqual({ ok: false, code: 'conflict' });
      expect(await count(fx.db, 'social_commands')).toBe(2);
      await expect(
        fx.db.batch([
          fx.db
            .prepare(
              'INSERT INTO social_commands(actor,key,request_hash,execution_nonce,result_code,created_at) VALUES (?,?,?,?,?,?)',
            )
            .bind(ACTOR_A, 'rollback', 'hash', 'nonce', 'ok', VECTOR_NOW),
          fx.db
            .prepare(
              'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES (?,?,?,?,?)',
            )
            .bind('bad', A.sub, 'duplicate', 0, VECTOR_NOW),
        ]),
      ).rejects.toThrow();
      expect(await count(fx.db, 'social_commands')).toBe(2);
    } finally {
      await fx.dispose();
    }
  });

  it('uses a nonce latch and removes social plus personal rows in one batch', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      await seedProfiles(fx.db);
      await fx.db
        .prepare(
          'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES (?,?,?,?,?)',
        )
        .bind('post', ACTOR_A, 'body', '2027-01-01', VECTOR_NOW)
        .run();
      expect(await deleteAccountProjection(fx.db, A, 'secret', VECTOR_NOW)).toBe(true);
      const latch = await fx.db
        .prepare('SELECT execution_nonce FROM deleted_users WHERE sub = ?')
        .bind(A.sub)
        .first<{ execution_nonce: string }>();
      expect(await deleteAccountProjection(fx.db, A, 'secret', VECTOR_NOW)).toBe(false);
      expect(await count(fx.db, 'social_posts')).toBe(0);
      expect(await count(fx.db, 'users')).toBe(1);
      expect(
        (
          await fx.db
            .prepare('SELECT execution_nonce FROM deleted_users WHERE sub = ?')
            .bind(A.sub)
            .first<{ execution_nonce: string }>()
        )?.execution_nonce,
      ).toBe(latch?.execution_nonce);
      expect(
        (await fx.db.prepare('SELECT sid FROM sessions WHERE sid = ?').bind(A.sid).first()) !==
          null,
      ).toBe(true);
      await fx.db.prepare('DELETE FROM deleted_users WHERE sub = ?').bind(A.sub).run();
      await fx.db.prepare('DELETE FROM sessions WHERE sub = ?').bind(A.sub).run();
      await fx.db
        .prepare('INSERT INTO users(sub,email,created_at) VALUES (?,?,?)')
        .bind(A.sub, 'new@example.test', A.expiresAt)
        .run();
      await fx.db
        .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES (?,?,?,?)')
        .bind('sid-a-new', A.sub, A.expiresAt, A.expiresAt)
        .run();
      expect(
        await createProfile(await createSocialActor(fx.db, A, VECTOR_NOW), 'Old session'),
      ).toEqual({ ok: false, code: 'unauthorized' });
      const rejoined = await createProfile(
        await createSocialActor(fx.db, { ...A, sid: 'sid-a-new' }, VECTOR_NOW),
        'Rejoined',
      );
      expect(rejoined.ok && rejoined.value.id !== ACTOR_A).toBe(true);
    } finally {
      await fx.dispose();
    }
  });

  it('deletes a profileless account through the same nonce latch', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      expect(await deleteAccountProjection(fx.db, A, 'secret', VECTOR_NOW)).toBe(true);
      expect(await count(fx.db, 'social_profiles')).toBe(0);
      expect(await count(fx.db, 'users')).toBe(1);
      expect(await deleteAccountProjection(fx.db, A, 'secret', VECTOR_NOW)).toBe(false);
    } finally {
      await fx.dispose();
    }
  });

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
        expect(await expirePendingPair(actor, ACTOR_B)).toBe(true);
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
