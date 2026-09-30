import { describe, expect, it } from 'vitest';

import { createSocialActor } from './actor';
import { decodeProjectionCursor } from './category-cursor';
import { PUBLIC_SCAN_LIMIT, readPublicCategories, readPublicFeed } from './public-feed-read';
import { readPublicPost, validatePublicPosts, type PublicContext } from './public-read';
import { createD1Fixture } from '../test/d1-harness';

const NOW = 1_800_000_000_000;
const EXPIRY = '2099-01-01T00:00:00.000Z';
const OWNER = 'a'.repeat(32);
const FILTERED = 'b'.repeat(32);
const VIEWER = 'c'.repeat(32);
const CATEGORY = 'd'.repeat(32);
const OTHER_CATEGORY = 'e'.repeat(32);
const SECRET = 'pagination-secret';
const url = (cursor?: string | null, categoryId?: string, limit = 1) => {
  const result = new URL('https://tasky.test/api/social/public/feed');
  result.searchParams.set('limit', String(limit));
  if (cursor) result.searchParams.set('cursor', cursor);
  if (categoryId) result.searchParams.set('categoryId', categoryId);
  return result;
};
const hex = (n: number) => n.toString(16).padStart(32, '0');
function success<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('예상한 성공 결과가 없어요.');
  return result.value;
}
async function seed(db: D1Database) {
  for (const [sub, id] of [
    ['owner', OWNER],
    ['filtered', FILTERED],
    ['viewer', VIEWER],
  ]) {
    await db.batch([
      db
        .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
        .bind(sub, `${sub}@test.invalid`, EXPIRY),
      db
        .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES(?,?,?,?)')
        .bind(sub, sub, EXPIRY, EXPIRY),
      db
        .prepare(
          'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,0,?)',
        )
        .bind(id, sub, sub, NOW),
    ]);
  }
  for (const [id, owner] of [
    [CATEGORY, OWNER],
    [OTHER_CATEGORY, FILTERED],
  ])
    await db
      .prepare(
        'INSERT INTO social_categories(id,owner,name,color,visibility,version,updated_at) VALUES(?,?,?,?,?,1,?)',
      )
      .bind(id, owner, '공개 카테고리', '#7CC6FF', 'public', NOW)
      .run();
}
async function insert(db: D1Database, id: string, category = CATEGORY, stamp = NOW) {
  await db
    .prepare(
      'INSERT INTO social_posts(id,author,text,happened_on,created_at,category_id) VALUES(?,?,?,?,?,?)',
    )
    .bind(id, category === CATEGORY ? OWNER : FILTERED, `문장 ${id}`, '2026-09-28', stamp, category)
    .run();
}
const context = (db: D1Database): PublicContext => ({
  db,
  actor: null,
  policySubs: ['owner'],
  nowMs: NOW,
});

async function scanFixture(db: D1Database) {
  await seed(db);
  await db
    .prepare(
      `WITH RECURSIVE items(n) AS (VALUES(1) UNION ALL SELECT n+1 FROM items WHERE n<1001)
    INSERT INTO social_posts(id,author,text,happened_on,created_at,category_id)
    SELECT printf('%032x',n),?1,'차단된 사본','2026-09-28',?2-n,?3 FROM items`,
    )
    .bind(FILTERED, NOW, OTHER_CATEGORY)
    .run();
  await insert(db, hex(2000), CATEGORY, NOW - 2000);
}

describe('공개 페이지의 bounded scan과 암호화 cursor', () => {
  it('동일 시각의 id 내림차순 페이지를 교체하고 actor·scope·필터·만료·위변조를 검증한다', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      for (const id of [hex(1), hex(2), hex(3)]) await insert(fx.db, id);
      const ctx = context(fx.db);
      const first = success(await readPublicFeed(ctx, url(), SECRET));
      expect(first.items.map((post) => post.id)).toEqual([hex(3)]);
      expect(first.nextCursor).toEqual(expect.any(String));
      const second = success(await readPublicFeed(ctx, url(first.nextCursor), SECRET));
      expect(second.items.map((post) => post.id)).toEqual([hex(2)]);
      const third = success(await readPublicFeed(ctx, url(second.nextCursor), SECRET));
      expect(third.items.map((post) => post.id)).toEqual([hex(1)]);
      expect(third.nextCursor).toBeNull();
      const decoded = await decodeProjectionCursor(
        SECRET,
        first.nextCursor,
        'anonymous',
        'public:feed:*',
        NOW,
      );
      const decodedNext = await decodeProjectionCursor(
        SECRET,
        second.nextCursor,
        'anonymous',
        'public:feed:*',
        NOW,
      );
      expect(decodedNext?.expiresAt).toBe(decoded?.expiresAt);
      const signed = await createSocialActor(
        fx.db,
        { ok: true, sub: 'viewer', sid: 'viewer', expiresAt: EXPIRY },
        NOW,
      );
      const invalid = [
        readPublicFeed({ ...ctx, actor: signed }, url(first.nextCursor), SECRET),
        readPublicFeed(ctx, url(first.nextCursor, CATEGORY), SECRET),
        readPublicFeed({ ...ctx, nowMs: NOW + 900_000 }, url(first.nextCursor), SECRET),
        readPublicFeed(
          ctx,
          url(first.nextCursor!.slice(0, -1) + (first.nextCursor!.endsWith('A') ? 'B' : 'A')),
          SECRET,
        ),
        readPublicCategories(
          ctx,
          new URL(`https://tasky.test/api/social/public/categories?cursor=${first.nextCursor}`),
          SECRET,
        ),
      ];
      for (const result of await Promise.all(invalid))
        expect(result).toEqual({ ok: false, code: 'validation' });
      const bounded = success(await readPublicFeed(ctx, url(undefined, CATEGORY), SECRET));
      expect(bounded.items).toHaveLength(1);
      await insert(fx.db, hex(4));
      const continued = success(await readPublicFeed(ctx, url(first.nextCursor), SECRET));
      expect(continued.items.map((post) => post.id)).toEqual([hex(2)]);
    } finally {
      await fx.dispose();
    }
  }, 20_000);

  it('1000개를 넘는 제외 후보도 빈 페이지 cursor를 진행하고 본문 조회와 내부 id 노출을 제한한다', async () => {
    const fx = await createD1Fixture();
    try {
      await scanFixture(fx.db);
      const statements: string[] = [];
      const tracked = new Proxy(fx.db, {
        get(target, property) {
          if (property === 'prepare')
            return (statement: string) => {
              statements.push(statement);
              return target.prepare(statement);
            };
          return Reflect.get(target, property);
        },
      });
      const ctx = context(tracked);
      const first = success(await readPublicFeed(ctx, url(undefined, undefined, 20), SECRET));
      expect(first.items).toEqual([]);
      expect(first.nextCursor).toEqual(expect.any(String));
      const candidate = statements.find((statement) =>
        statement.includes('FROM social_public_posts'),
      );
      expect(candidate).toContain(`LIMIT ${PUBLIC_SCAN_LIMIT}`);
      expect(candidate).not.toMatch(/OFFSET|SELECT\s+\*/iu);
      const readsBefore = statements.length;
      expect(await readPublicFeed(ctx, url('invalid-cursor'), SECRET)).toEqual({
        ok: false,
        code: 'validation',
      });
      expect(statements).toHaveLength(readsBefore);
      const cursor = await decodeProjectionCursor(
        SECRET,
        first.nextCursor,
        'anonymous',
        'public:feed:*',
        NOW,
      );
      expect(cursor?.last).toEqual({ id: hex(1000), createdAt: NOW - 1000 });
      expect(first.nextCursor).not.toContain(hex(1000));
      expect(Buffer.from(first.nextCursor!, 'base64url').toString('utf8')).not.toContain(hex(1000));
      const repeated = success(await readPublicFeed(ctx, url(undefined, undefined, 20), SECRET));
      expect(repeated.nextCursor).not.toBe(first.nextCursor);
      expect(
        await decodeProjectionCursor(
          SECRET,
          repeated.nextCursor,
          'anonymous',
          'public:feed:*',
          NOW,
        ),
      ).toEqual(cursor);
      const next = success(await readPublicFeed(ctx, url(first.nextCursor, undefined, 20), SECRET));
      expect(next.items.map((post) => post.id)).toEqual([hex(2000)]);
      expect(next.nextCursor).toBeNull();
    } finally {
      await fx.dispose();
    }
  }, 20_000);

  it('차단된 1001개 후보도 cursor를 진행하고 anonymous에선 현재 공개 자료를 읽는다', async () => {
    const fx = await createD1Fixture();
    try {
      await scanFixture(fx.db);
      const actor = await createSocialActor(
        fx.db,
        { ok: true, sub: 'viewer', sid: 'viewer', expiresAt: EXPIRY },
        NOW,
      );
      await fx.db
        .prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES(?,?,?)')
        .bind(FILTERED, VIEWER, NOW)
        .run();
      const ctx: PublicContext = {
        db: fx.db,
        actor,
        policySubs: ['owner', 'filtered', 'viewer'],
        nowMs: NOW,
      };
      const first = success(await readPublicFeed(ctx, url(undefined, undefined, 20), SECRET));
      expect(first.items).toEqual([]);
      expect(first.nextCursor).not.toBeNull();
      const next = success(await readPublicFeed(ctx, url(first.nextCursor, undefined, 20), SECRET));
      expect(next.items.map((post) => post.id)).toEqual([hex(2000)]);
      const anon = success(await readPublicFeed({ ...ctx, actor: null }, url(), SECRET));
      expect(anon.items.map((post) => post.id)).toEqual([hex(1)]);
      expect(await readPublicFeed({ ...ctx, actor: null }, url(first.nextCursor), SECRET)).toEqual({
        ok: false,
        code: 'validation',
      });
    } finally {
      await fx.dispose();
    }
  }, 20_000);

  it('오래된 membership hint와 삭제된 프로필은 현재 category ACL을 우회하지 못한다', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      await insert(fx.db, hex(1));
      const ctx = context(fx.db);
      expect(success(await readPublicFeed(ctx, url(), SECRET)).items).toHaveLength(1);
      await fx.db
        .prepare('UPDATE social_categories SET visibility = ? WHERE id = ?')
        .bind('private', CATEGORY)
        .run();
      await fx.db.batch([
        fx.db
          .prepare('INSERT INTO social_public_posts(id,category_id,created_at) VALUES(?,?,?)')
          .bind(hex(1), CATEGORY, NOW),
        fx.db.prepare('INSERT INTO social_public_categories(id) VALUES(?)').bind(CATEGORY),
      ]);
      expect(success(await readPublicFeed(ctx, url(), SECRET)).items).toEqual([]);
      expect(
        success(
          await readPublicCategories(
            ctx,
            new URL('https://tasky.test/api/social/public/categories'),
            SECRET,
          ),
        ).items,
      ).toEqual([]);
      expect((await readPublicPost(ctx, hex(1))).ok).toBe(false);
      expect(success(await validatePublicPosts(ctx, [hex(1)])).allowedIds).toEqual([]);
      await fx.db
        .prepare('UPDATE social_categories SET visibility = ? WHERE id = ?')
        .bind('public', CATEGORY)
        .run();
      await fx.db
        .prepare('INSERT INTO deleted_users(sub,deleted_at) VALUES(?,?)')
        .bind('owner', EXPIRY)
        .run();
      expect(success(await readPublicFeed(ctx, url(), SECRET)).items).toEqual([]);
      expect(success(await validatePublicPosts(ctx, [hex(1)])).allowedIds).toEqual([]);
    } finally {
      await fx.dispose();
    }
  }, 15_000);
});
