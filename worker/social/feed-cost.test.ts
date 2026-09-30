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
      `SELECT post.id FROM social_posts post LEFT JOIN social_categories cat ON cat.id = post.category_id
      WHERE post.author <= printf('%032x',51)
        AND (post.author = printf('%032x',1) OR post.category_id IS NULL
          OR (cat.owner = post.author AND cat.deleted_at IS NULL AND cat.visibility IN ('friends','public')))
        AND (post.created_at,post.id) < (?,?)
      ORDER BY post.created_at DESC,post.id DESC LIMIT ?`,
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
  evidence?: number[],
): Promise<FeedSeek> {
  const result = await queryFeedRows(actor, VIEWER, seek, limit, 'feed');
  evidence?.push(result.meta.rows_read);
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
    .bind(VIEWER, actor.sub, actor.sid, actor.nowIso, NOW + 1, FIRST.beforeId, 51, 'feed', null)
    .all<{ detail: string }>();
  const ranges = plan.results
    .map((row) => row.detail)
    .filter((detail) => detail.includes('social_posts_author_created_id'));
  expect(ranges.some((detail) => detail.includes('(created_at,id)<'))).toBe(true);
  expect(ranges.some((detail) => detail.includes('(created_at,id)>'))).toBe(true);
  expect(plan.results.some((row) => row.detail.includes('MATERIALIZE seed_top'))).toBe(true);
  expect(plan.results.some((row) => /SCAN social_posts\b/u.test(row.detail))).toBe(false);
  const friendRanges = plan.results
    .map((row) => row.detail)
    .filter((detail) => detail.includes('social_friend_posts_author_created_id'));
  expect(friendRanges.some((detail) => detail.includes('(created_at,id)<'))).toBe(true);
  expect(friendRanges.some((detail) => detail.includes('(created_at,id)>'))).toBe(true);
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

async function seedHidden(db: D1Database): Promise<SocialActor> {
  const actor = await seed(db, 'balanced');
  await db
    .prepare(
      `WITH RECURSIVE n(i) AS (VALUES(2) UNION ALL SELECT i+1 FROM n WHERE i<51)
    INSERT INTO social_categories(id,owner,name,color,visibility,version,updated_at,deleted_at)
    SELECT printf('%032x',i),printf('%032x',i),'숨겨진 카테고리','#7CC6FF','private',1,?,CASE WHEN i%2=0 THEN ? ELSE NULL END FROM n`,
    )
    .bind(NOW, NOW)
    .run();
  await db
    .prepare(
      "UPDATE social_posts SET category_id = author WHERE author > ? AND author <= printf('%032x',51)",
    )
    .bind(VIEWER)
    .run();
  await db
    .prepare('UPDATE social_posts SET created_at = created_at-3000 WHERE author = ?')
    .bind(VIEWER)
    .run();
  await db
    .prepare(
      `WITH RECURSIVE n(i) AS (VALUES(2) UNION ALL SELECT i+1 FROM n WHERE i<51)
    INSERT INTO social_categories(id,owner,name,color,visibility,version,updated_at)
    SELECT printf('%032x',100000+i),printf('%032x',i),'허용 카테고리','#7CC6FF',CASE WHEN i%2=0 THEN 'friends' ELSE 'public' END,1,? FROM n`,
    )
    .bind(NOW)
    .run();
  await db
    .prepare(
      `WITH RECURSIVE n(i) AS (VALUES(2) UNION ALL SELECT i+1 FROM n WHERE i<51)
    INSERT INTO social_posts(id,author,text,happened_on,created_at,category_id)
    SELECT printf('%032x',100000000+i),printf('%032x',i),'이전 허용 기록','2026-09-28',?,printf('%032x',100000+i) FROM n`,
    )
    .bind(NOW - 2000)
    .run();
  return actor;
}

describe('feed D1 cost with newer hidden category records', () => {
  it('친구 50명의 최신 private/tombstone 1000개를 건너뛴 정확한 페이지도 읽기 예산을 지킨다', async () => {
    const fx = await createD1Fixture();
    try {
      const actor = await seedHidden(fx.db);
      const evidence: number[] = [];
      await checkPage(actor, fx.db, FIRST, 20, evidence);
      const next = await checkPage(actor, fx.db, FIRST, 50, evidence);
      await checkPage(actor, fx.db, next, 50, evidence);
      console.warn('hidden-category feed rows_read (20/50/next50):', evidence);
      await fx.db
        .prepare(
          "UPDATE social_friend_posts SET author = printf('%032x',2) WHERE id = printf('%032x',52000001)",
        )
        .run();
      await checkPage(actor, fx.db, FIRST, 20);
      await checkPlan(fx.db, actor);
    } finally {
      await fx.dispose();
    }
  }, 120_000);
});
