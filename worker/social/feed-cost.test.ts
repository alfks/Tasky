import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { createSocialActor, type SocialActor } from './actor';
import { queryFeedRows, type FeedSeek } from './feed-read';
import { createD1Fixture } from '../test/d1-harness';

const NOW = 1_800_000_000_000;
const EXPIRY = '2099-01-01T00:00:00.000Z';
const VIEWER = '1'.padStart(32, '0');
const FIRST = { beforeCreatedAt: NOW + 1, beforeId: '0'.repeat(32) };
const AUTHOR_COUNT = 52;
const POSTS_PER_AUTHOR = 1000;

type Distribution = 'balanced' | 'skewed';

async function seed(db: D1Database, distribution: Distribution): Promise<SocialActor> {
  const authors = `WITH RECURSIVE authors(i) AS (
    VALUES(0) UNION ALL SELECT i+1 FROM authors WHERE i < ${AUTHOR_COUNT - 1}
  )`;
  await db
    .prepare(
      `${authors} INSERT INTO users(sub,email,created_at)
      SELECT printf('user-%02d',i),printf('user-%02d@example.test',i),? FROM authors`,
    )
    .bind(EXPIRY)
    .run();
  await db
    .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES(?,?,?,?)')
    .bind('sid-viewer', 'user-00', EXPIRY, EXPIRY)
    .run();
  await db
    .prepare(
      `${authors} INSERT INTO social_profiles(id,sub,nickname,version,created_at)
      SELECT printf('%032x',i+1),printf('user-%02d',i),printf('user-%02d',i),0,?
      FROM authors`,
    )
    .bind(NOW)
    .run();
  await db
    .prepare(
      `${authors} INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at)
      SELECT ?,printf('%032x',i+1),'accepted',NULL,1,NULL
      FROM authors WHERE i BETWEEN 1 AND 50`,
    )
    .bind(VIEWER)
    .run();
  await db
    .prepare(
      `WITH RECURSIVE authors(i) AS (
        VALUES(0) UNION ALL SELECT i+1 FROM authors WHERE i < ${AUTHOR_COUNT - 1}
      ), posts(n) AS (
        VALUES(1) UNION ALL SELECT n+1 FROM posts WHERE n < ${POSTS_PER_AUTHOR}
      ) INSERT INTO social_posts(id,author,text,happened_on,created_at)
      SELECT printf('%032x',(i+1)*1000000+n),printf('%032x',i+1),
        printf('post-%02d-%04d',i,n),'2026-09-28',
        CASE WHEN ? = 'balanced' THEN ? - n
          WHEN i = 0 THEN ? - n
          WHEN i <= 30 THEN ? - 1000 - n
          ELSE ? - 2000 - n END
      FROM authors CROSS JOIN posts`,
    )
    .bind(distribution, NOW, NOW, NOW, NOW)
    .run();
  return createSocialActor(
    db,
    { ok: true, sub: 'user-00', sid: 'sid-viewer', expiresAt: EXPIRY },
    NOW,
  );
}

async function expectedIds(db: D1Database, seek: FeedSeek, count: number): Promise<string[]> {
  const result = await db
    .prepare(
      `SELECT id FROM social_posts
      WHERE author <= printf('%032x',51)
        AND (created_at,id) < (?,?)
      ORDER BY created_at DESC,id DESC LIMIT ?`,
    )
    .bind(seek.beforeCreatedAt, seek.beforeId, count)
    .all<{ id: string }>();
  return result.results.map((row) => row.id);
}

async function checkPage(
  actor: SocialActor,
  db: D1Database,
  seek: FeedSeek,
  limit: number,
): Promise<FeedSeek> {
  const result = await queryFeedRows(actor, VIEWER, seek, limit, 'feed');
  expect(result.results).toHaveLength(limit + 1);
  expect(result.results.map((row) => row.id)).toEqual(await expectedIds(db, seek, limit + 1));
  expect(result.results.every((row) => typeof row.created_at === 'number')).toBe(true);
  expect(result.results.every((row) => row.author !== '34'.padStart(32, '0'))).toBe(true);
  expect(result.meta.rows_read).toBeLessThanOrEqual(5000);
  expect(result.meta.rows_written).toBe(0);
  const last = result.results[limit - 1];
  if (!last) throw new Error('missing last visible post');
  return { beforeCreatedAt: last.created_at, beforeId: last.id };
}

async function checkPlan(db: D1Database, actor: SocialActor): Promise<void> {
  const source = readFileSync(new URL('./feed-read.ts', import.meta.url), 'utf8');
  const literal = source.match(/return actor\.db\.prepare\(sql`([\s\S]*?)`\);/u)?.[1];
  if (!literal) throw new Error('feed SQL literal missing');
  const plan = await db
    .prepare(`EXPLAIN QUERY PLAN ${literal}`)
    .bind(VIEWER, actor.sub, actor.sid, actor.nowIso, NOW + 1, FIRST.beforeId, 51, 'feed')
    .all<{ detail: string }>();
  const ranges = plan.results
    .map((row) => row.detail)
    .filter((detail) => detail.includes('social_posts_author_created_id'));
  expect(ranges.some((detail) => detail.includes('(created_at,id)<'))).toBe(true);
  expect(ranges.some((detail) => detail.includes('(created_at,id)>'))).toBe(true);
  expect(plan.results.some((row) => row.detail.includes('MATERIALIZE seed_top'))).toBe(true);
  expect(plan.results.some((row) => /SCAN social_posts\b/u.test(row.detail))).toBe(false);
}

describe('feed D1 cost at 50 friends x 1000 posts', () => {
  for (const distribution of ['balanced', 'skewed'] as const) {
    it(`${distribution}: first, max and next pages stay within read budget`, async () => {
      const fx = await createD1Fixture();
      try {
        const actor = await seed(fx.db, distribution);
        await checkPlan(fx.db, actor);
        await checkPage(actor, fx.db, FIRST, 20);
        const next = await checkPage(actor, fx.db, FIRST, 50);
        await checkPage(actor, fx.db, next, 50);
      } finally {
        await fx.dispose();
      }
    }, 120_000);
  }
});
