import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createSocialActor } from './actor';
import { queryFeedRows, readFeedPage } from './feed-read';
import { createD1Fixture } from '../test/d1-harness';

const NOW = 1_800_000_000_000;
const EXPIRY = '2099-01-01T00:00:00.000Z';
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const C = 'c'.repeat(32);
const POST_A = '1'.repeat(32);
const POST_B = '2'.repeat(32);

describe('feed indexed candidate query', () => {
  it('reads self and current friend through the static correlated D1 statement', async () => {
    const fx = await createD1Fixture();
    try {
      for (const [sub, sid, id] of [
        ['user-a', 'sid-a', A],
        ['user-b', 'sid-b', B],
        ['user-c', 'sid-c', C],
      ]) {
        await fx.db
          .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
          .bind(sub, `${sub}@example.test`, EXPIRY)
          .run();
        await fx.db
          .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES(?,?,?,?)')
          .bind(sid, sub, '2020-01-01T00:00:00.000Z', EXPIRY)
          .run();
        await fx.db
          .prepare(
            'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,0,?)',
          )
          .bind(id, sub, sub, NOW)
          .run();
      }
      await fx.db
        .prepare(
          'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(A, B, 'accepted', null, 1, null)
        .run();
      await fx.db
        .prepare(
          'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(B, C, 'accepted', null, 1, null)
        .run();
      for (const [id, author, stamp] of [
        [POST_A, A, NOW - 1],
        [POST_B, B, NOW - 1],
      ] as const)
        await fx.db
          .prepare(
            'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)',
          )
          .bind(id, author, id, '2026-09-28', stamp)
          .run();
      await fx.db
        .prepare('INSERT INTO social_reactions(post_id,reactor,created_at) VALUES(?,?,?)')
        .bind(POST_A, B, NOW)
        .run();
      await fx.db
        .prepare('INSERT INTO social_reactions(post_id,reactor,created_at) VALUES(?,?,?)')
        .bind(POST_B, A, NOW)
        .run();
      await fx.db
        .prepare('INSERT INTO social_reactions(post_id,reactor,created_at) VALUES(?,?,?)')
        .bind(POST_B, C, NOW)
        .run();
      const actor = await createSocialActor(
        fx.db,
        { ok: true, sub: 'user-a', sid: 'sid-a', expiresAt: EXPIRY },
        NOW,
      );
      const result = await queryFeedRows(
        actor,
        A,
        {
          beforeCreatedAt: NOW + 1,
          beforeId: '0'.repeat(32),
        },
        20,
        'feed',
      );
      expect(result.results.map((row) => row.id)).toEqual([POST_B, POST_A]);
      expect(result.results.map((row) => [row.reactionCount, row.myReaction])).toEqual([
        [2, 1],
        [1, 0],
      ]);
      const first = await readFeedPage(
        actor,
        new URL('https://tasky.example/api/social/feed?limit=1'),
        'secret',
        'feed',
      );
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error('first page failed');
      expect(first.value.items.map((post) => post.id)).toEqual([POST_B]);
      expect(first.value.nextCursor).toEqual(expect.any(String));
      await fx.db
        .prepare(
          'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)',
        )
        .bind('3'.repeat(32), B, 'newer same ms', '2026-09-28', NOW - 1)
        .run();
      const second = await readFeedPage(
        actor,
        new URL(
          `https://tasky.example/api/social/feed?limit=1&cursor=${encodeURIComponent(first.value.nextCursor!)}`,
        ),
        'secret',
        'feed',
      );
      expect(second.ok && second.value.items.map((post) => post.id)).toEqual([POST_A]);
      const mine = await readFeedPage(
        actor,
        new URL('https://tasky.example/api/social/posts/mine'),
        'secret',
        'posts:mine',
      );
      expect(mine.ok && mine.value.items.map((post) => post.id)).toEqual([POST_A]);
      await fx.db
        .prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES(?,?,?)')
        .bind(B, A, NOW)
        .run();
      const blocked = await readFeedPage(
        actor,
        new URL('https://tasky.example/api/social/feed'),
        'secret',
        'feed',
      );
      expect(blocked.ok && blocked.value.items.map((post) => post.id)).toEqual([POST_A]);
      if (blocked.ok) expect(blocked.value.items[0]?.reactionCount).toBe(0);
    } finally {
      await fx.dispose();
    }
  }, 15_000);

  it('50 friends plus self stay indexed and exclude the 52nd author', async () => {
    const fx = await createD1Fixture();
    try {
      const ids = `WITH RECURSIVE n(i) AS (
        VALUES(0) UNION ALL SELECT i+1 FROM n WHERE i < 51
      )`;
      await fx.db
        .prepare(
          `${ids} INSERT INTO users(sub,email,created_at)
        SELECT printf('user-%02d',i),printf('user-%02d@example.test',i),? FROM n`,
        )
        .bind(EXPIRY)
        .run();
      await fx.db
        .prepare(
          `INSERT INTO sessions(sid,sub,created_at,expires_at)
        VALUES('sid-0','user-00',?,?)`,
        )
        .bind(EXPIRY, EXPIRY)
        .run();
      await fx.db
        .prepare(
          `${ids} INSERT INTO social_profiles(id,sub,nickname,version,created_at)
        SELECT printf('%032x',i+1),printf('user-%02d',i),printf('user-%02d',i),0,?
        FROM n`,
        )
        .bind(NOW)
        .run();
      await fx.db
        .prepare(
          `${ids} INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at)
        SELECT printf('%032x',1),printf('%032x',i+1),'accepted',NULL,1,NULL
        FROM n WHERE i BETWEEN 1 AND 50`,
        )
        .run();
      await fx.db
        .prepare(
          `${ids} INSERT INTO social_posts(id,author,text,happened_on,created_at)
        SELECT printf('%032x',i+1001),printf('%032x',i+1),
          printf('post-%02d',i),'2026-09-28',? FROM n`,
        )
        .bind(NOW - 1)
        .run();
      const actor = await createSocialActor(
        fx.db,
        { ok: true, sub: 'user-00', sid: 'sid-0', expiresAt: EXPIRY },
        NOW,
      );
      const bounds = {
        beforeCreatedAt: NOW + 1,
        beforeId: '0'.repeat(32),
      };
      const result = await queryFeedRows(actor, '1'.padStart(32, '0'), bounds, 50, 'feed');
      expect(result.results).toHaveLength(51);
      expect(result.results.map((row) => row.id)).not.toContain(
        (1052).toString(16).padStart(32, '0'),
      );
      expect(result.meta.rows_read).toBeLessThan(3000);
      const first = await readFeedPage(
        actor,
        new URL('https://tasky.example/api/social/feed?limit=50'),
        'secret',
        'feed',
      );
      expect(first.ok && first.value.items).toHaveLength(50);
      if (!first.ok || !first.value.nextCursor) throw new Error('missing page cursor');
      const next = await readFeedPage(
        actor,
        new URL(`https://tasky.example/api/social/feed?limit=50&cursor=${first.value.nextCursor}`),
        'secret',
        'feed',
      );
      expect(next.ok && next.value.items).toHaveLength(1);
      const source = readFileSync(new URL('./feed-read.ts', import.meta.url), 'utf8');
      const literal = source.match(/return actor\.db\.prepare\(sql`([\s\S]*?)`\);/u)?.[1];
      expect(literal).toBeDefined();
      if (!literal) throw new Error('feed SQL literal missing');
      const plan = await fx.db
        .prepare(`EXPLAIN QUERY PLAN ${literal}`)
        .bind(
          actor.profileId,
          actor.sub,
          actor.sid,
          actor.nowIso,
          bounds.beforeCreatedAt,
          bounds.beforeId,
          51,
          'feed',
        )
        .all<{ detail: string }>();
      expect(
        plan.results.some((row) => row.detail.includes('social_posts_author_created_id')),
      ).toBe(true);
      expect(plan.results.some((row) => /SCAN social_posts\b/u.test(row.detail))).toBe(false);
    } finally {
      await fx.dispose();
    }
  }, 30_000);

  it('deep last tuple seeks near the cursor instead of rereading the upper gap', async () => {
    const fx = await createD1Fixture();
    try {
      await fx.db
        .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
        .bind('actor', 'actor@example.test', EXPIRY)
        .run();
      await fx.db
        .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES(?,?,?,?)')
        .bind('sid', 'actor', EXPIRY, EXPIRY)
        .run();
      await fx.db
        .prepare(
          'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,0,?)',
        )
        .bind(A, 'actor', 'actor', NOW)
        .run();
      await fx.db
        .prepare(
          `WITH RECURSIVE n(i) AS (
        VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i < 1000
      ) INSERT INTO social_posts(id,author,text,happened_on,created_at)
        SELECT printf('%032x',i),?,'record','2026-09-28',? - i FROM n`,
        )
        .bind(A, NOW)
        .run();
      const actor = await createSocialActor(
        fx.db,
        { ok: true, sub: 'actor', sid: 'sid', expiresAt: EXPIRY },
        NOW,
      );
      const result = await queryFeedRows(
        actor,
        A,
        {
          beforeCreatedAt: NOW - 900,
          beforeId: (900).toString(16).padStart(32, '0'),
        },
        20,
        'posts:mine',
      );
      expect(result.results).toHaveLength(21);
      expect(result.results[0]?.created_at).toBe(NOW - 901);
      expect(result.meta.rows_read).toBeLessThan(250);
    } finally {
      await fx.dispose();
    }
  }, 30_000);
});
