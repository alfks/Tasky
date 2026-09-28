import { describe, expect, it } from 'vitest';

import { createSocialActor, type SocialActor } from './actor';
import { decodeFeedCursor } from './cursor';
import { readFeedPage } from './feed-read';
import { createD1Fixture } from '../test/d1-harness';

const NOW = 1_800_000_000_000;
const EXPIRY = '2099-01-01T00:00:00.000Z';
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const postId = (n: number) => n.toString(16).padStart(32, '0');

async function seed(db: D1Database, postCount: number): Promise<SocialActor> {
  await db.batch([
    db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
      .bind('viewer', 'viewer@example.test', EXPIRY),
    db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
      .bind('author', 'author@example.test', EXPIRY),
    db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES(?,?,?,?)')
      .bind('sid-viewer', 'viewer', EXPIRY, EXPIRY),
    db
      .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,0,?)')
      .bind(A, 'viewer', 'viewer', NOW),
    db
      .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,0,?)')
      .bind(B, 'author', 'author', NOW),
    db
      .prepare(
        'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES(?,?,?,?,?,?)',
      )
      .bind(A, B, 'accepted', null, 1, null),
  ]);
  await db
    .prepare(
      `WITH RECURSIVE n(i) AS (
    VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i < ?
  ) INSERT INTO social_posts(id,author,text,happened_on,created_at)
    SELECT printf('%032x',i),?,printf('post-%d',i),'2026-09-28',? FROM n`,
    )
    .bind(postCount, B, NOW - 1)
    .run();
  return createSocialActor(
    db,
    { ok: true, sub: 'viewer', sid: 'sid-viewer', expiresAt: EXPIRY },
    NOW,
  );
}

async function page(actor: SocialActor, limit?: number, cursor?: string) {
  const url = new URL('https://tasky.example/api/social/feed');
  if (limit !== undefined) url.searchParams.set('limit', String(limit));
  if (cursor) url.searchParams.set('cursor', cursor);
  const outcome = await readFeedPage(actor, url, 'secret', 'feed');
  if (!outcome.ok) throw new Error(`feed failed: ${outcome.code}`);
  return outcome.value;
}

describe('feed pagination under current ACL', () => {
  it('includes both endpoint IDs at now and excludes every next-ms ID', async () => {
    const fx = await createD1Fixture();
    try {
      const actor = await seed(fx.db, 1);
      const atNow = ['0'.repeat(32), '8'.repeat(32), 'f'.repeat(32)];
      const future = [postId(2), '1'.repeat(32)];
      for (const [id, stamp] of [
        ...atNow.map((id) => [id, NOW] as const),
        ...future.map((id) => [id, NOW + 1] as const),
      ])
        await fx.db
          .prepare(
            'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)',
          )
          .bind(id, A, id, '2026-09-28', stamp)
          .run();
      const first = await page(actor, 1);
      const second = await page(actor, 1, first.nextCursor!);
      const firstCursor = await decodeFeedCursor('secret', first.nextCursor, A, 'feed', NOW);
      const secondCursor = await decodeFeedCursor('secret', second.nextCursor, A, 'feed', NOW);
      expect([first.items[0]?.id, second.items[0]?.id]).toEqual([atNow[2], atNow[1]]);
      expect(secondCursor?.upper).toEqual(firstCursor?.upper);
      expect(secondCursor?.expiresAt).toBe(firstCursor?.expiresAt);
      const third = await page(actor, 1, second.nextCursor!);
      const fourth = await page(actor, 1, third.nextCursor!);
      expect([third.items[0]?.id, fourth.items[0]?.id]).toEqual([atNow[0], postId(1)]);
      expect(fourth.nextCursor).toBeNull();
      await fx.db.prepare('DELETE FROM social_posts WHERE id = ?').bind(atNow[0]).run();
      await fx.db
        .prepare(
          'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)',
        )
        .bind(atNow[0], A, 'next-ms minimum', '2026-09-28', NOW + 1)
        .run();
      expect((await page(actor)).items.map((item) => item.id)).toEqual([
        atNow[2],
        atNow[1],
        postId(1),
      ]);
    } finally {
      await fx.dispose();
    }
  }, 15_000);

  it('default 20 and max 50 traverse 56 same-ms posts without duplicates or late additions', async () => {
    const fx = await createD1Fixture();
    try {
      const actor = await seed(fx.db, 55);
      await fx.db
        .prepare(
          'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)',
        )
        .bind(postId(56), A, 'own', '2026-09-28', NOW - 1)
        .run();
      const first = await page(actor);
      expect(first.items).toHaveLength(20);
      expect(first.nextCursor).toEqual(expect.any(String));
      await fx.db
        .prepare(
          'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)',
        )
        .bind(postId(100), B, 'late', '2026-09-28', NOW - 1)
        .run();
      const seen = [...first.items.map((item) => item.id)];
      let cursor = first.nextCursor;
      let pages = 1;
      while (cursor) {
        const next = await page(actor, undefined, cursor);
        seen.push(...next.items.map((item) => item.id));
        cursor = next.nextCursor;
        pages++;
        expect(pages).toBeLessThanOrEqual(3);
      }
      expect(pages).toBe(3);
      expect(seen).toEqual(Array.from({ length: 56 }, (_, i) => postId(56 - i)));
      expect(new Set(seen).size).toBe(56);
      await fx.db.prepare('DELETE FROM social_posts WHERE id = ?').bind(postId(100)).run();
      const maxFirst = await page(actor, 50);
      expect(maxFirst.items).toHaveLength(50);
      expect(maxFirst.nextCursor).toEqual(expect.any(String));
      const maxLast = await page(actor, 50, maxFirst.nextCursor!);
      expect(maxLast.items.map((item) => item.id)).toEqual(
        Array.from({ length: 6 }, (_, i) => postId(6 - i)),
      );
      expect(maxLast.nextCursor).toBeNull();
      const invalid = await readFeedPage(
        actor,
        new URL('https://tasky.example/api/social/feed?limit=51'),
        'secret',
        'feed',
      );
      expect(invalid).toEqual({ ok: false, code: 'validation' });
    } finally {
      await fx.dispose();
    }
  }, 30_000);

  it('friend removal, block and post deletion hide subsequent bodies in both serial orders', async () => {
    const fx = await createD1Fixture();
    try {
      const actor = await seed(fx.db, 21);
      const beforeRemove = await page(actor, 20);
      expect(beforeRemove.items).toHaveLength(20);
      if (!beforeRemove.nextCursor) throw new Error('missing cursor before removal');
      await fx.db
        .prepare("UPDATE social_pairs SET state = 'none' WHERE lo = ? AND hi = ?")
        .bind(A, B)
        .run();
      const afterRemove = await page(actor, 20, beforeRemove.nextCursor);
      expect(afterRemove).toEqual({ items: [], nextCursor: null });
      expect(await page(actor, 20)).toEqual({ items: [], nextCursor: null });

      await fx.db
        .prepare("UPDATE social_pairs SET state = 'accepted' WHERE lo = ? AND hi = ?")
        .bind(A, B)
        .run();
      const beforeBlock = await page(actor, 20);
      expect(beforeBlock.items).toHaveLength(20);
      if (!beforeBlock.nextCursor) throw new Error('missing cursor before block');
      await fx.db
        .prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES(?,?,?)')
        .bind(B, A, NOW)
        .run();
      expect(await page(actor, 20, beforeBlock.nextCursor)).toEqual({
        items: [],
        nextCursor: null,
      });
      expect(await page(actor, 20)).toEqual({ items: [], nextCursor: null });

      await fx.db
        .prepare('DELETE FROM social_blocks WHERE blocker = ? AND blocked = ?')
        .bind(B, A)
        .run();
      const beforeDelete = await page(actor, 20);
      expect(beforeDelete.items).toHaveLength(20);
      if (!beforeDelete.nextCursor) throw new Error('missing cursor before delete');
      await fx.db.prepare('DELETE FROM social_posts WHERE id = ?').bind(postId(1)).run();
      const emptyTail = await page(actor, 20, beforeDelete.nextCursor);
      expect(emptyTail).toEqual({ items: [], nextCursor: null });
      const fresh = await page(actor, 20);
      expect(fresh.items).toHaveLength(20);
      expect(fresh.nextCursor).toBeNull();
      expect(fresh.items.map((item) => item.id)).not.toContain(postId(1));
    } finally {
      await fx.dispose();
    }
  }, 30_000);
});
