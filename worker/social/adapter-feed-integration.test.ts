import { describe, expect, it } from 'vitest';

import { createHttpSocialRepository } from '@/infra/social/http-repository';

import { SESSION_COOKIE } from '../auth/cookies';
import { NOW, ORIGIN, key, withServer } from '../test/social-adapter-integration-fixture';

import type { SocialRepository } from '@/repositories/social-repository';
import type { Client, Server } from '../test/social-adapter-integration-fixture';

const IDS = { a: 'a'.repeat(32), b: 'b'.repeat(32), c: 'c'.repeat(32) };
const DATE = '2026-01-01';
type Actor = Client & { repo: SocialRepository };
type Context = { server: Server; a: Actor; b: Actor; c: Actor };

async function seeded(server: Server): Promise<Context> {
  const [a, b, c] = (await Promise.all(['a', 'b', 'c'].map(server.actor))).map((client) => ({
    ...client,
    repo: createHttpSocialRepository(client.transport),
  }));
  for (const [sub, id] of Object.entries(IDS)) {
    await server.env.DB.prepare(
      'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,?,?)',
    )
      .bind(id, sub, sub.toUpperCase(), 0, Date.parse(NOW))
      .run();
  }
  await server.env.DB.prepare(
    "INSERT INTO social_pairs(lo,hi,state,requester,version) VALUES(?,?,'accepted',NULL,1)",
  )
    .bind(IDS.a, IDS.b)
    .run();
  expect(new Set([a, b, c].map((actor) => actor.jar.get(SESSION_COOKIE))).size).toBe(3);
  return { server, a, b, c };
}

async function create(ctx: Context, n: number, text: string) {
  const input = { text, happenedOn: DATE };
  const data = (await ctx.a.repo.createPost(input, { key: key(n) })).data;
  return { id: data.id, input };
}

async function posts(ctx: Context) {
  return (
    await ctx.server.env.DB.prepare(
      'SELECT id,author,text,happened_on,created_at FROM social_posts WHERE author=? ORDER BY created_at DESC,id DESC',
    )
      .bind(IDS.a)
      .all<{ id: string; author: string; text: string; happened_on: string; created_at: number }>()
  ).results;
}

async function reactionRows(ctx: Context) {
  return (
    await ctx.server.env.DB.prepare(
      'SELECT post_id,reactor,created_at FROM social_reactions ORDER BY post_id,reactor',
    ).all<{ post_id: string; reactor: string; created_at: number }>()
  ).results;
}

async function postReplay(ctx: Context): Promise<string> {
  const first = await create(ctx, 101, '첫 번째');
  expect(ctx.a.seen.at(-1)?.status).toBe(201);
  const receipt = () =>
    ctx.server.env.DB.prepare(
      'SELECT actor,key,request_hash,execution_nonce,result_code,resource_id,result_version,created_at FROM social_commands WHERE actor=? AND key=?',
    )
      .bind(IDS.a, key(101))
      .first();
  const beforePost = await posts(ctx);
  const beforeReceipt = await receipt();
  expect((await ctx.a.repo.createPost(first.input, { key: key(101) })).data.id).toBe(first.id);
  expect(ctx.a.seen.at(-1)?.status).toBe(200);
  expect(await posts(ctx)).toEqual(beforePost);
  expect(await receipt()).toEqual(beforeReceipt);
  await expect(
    ctx.a.repo.createPost({ ...first.input, text: '변경' }, { key: key(101) }),
  ).rejects.toMatchObject({ code: 'idempotency-conflict' });
  expect(await posts(ctx)).toEqual(beforePost);
  expect(await receipt()).toEqual(beforeReceipt);
  await create(ctx, 102, '두 번째');
  await create(ctx, 103, '세 번째');
  expect(
    (
      await ctx.server.env.DB.prepare('SELECT COUNT(*) AS n FROM social_commands WHERE actor=?')
        .bind(IDS.a)
        .first<{ n: number }>()
    )?.n,
  ).toBe(3);
  return first.id;
}

async function pageAndValidate(ctx: Context, firstId: string): Promise<void> {
  const ordered = await posts(ctx);
  const mineIds: string[] = [];
  const feedIds: string[] = [];
  let mineCursor: string | null = null;
  let feedCursor: string | null = null;
  for (let n = 0; n < 3; n += 1) {
    const mine = (
      await ctx.a.repo.myPosts({ limit: 1, ...(mineCursor ? { cursor: mineCursor } : {}) })
    ).data;
    const feed = (
      await ctx.b.repo.feed({ limit: 1, ...(feedCursor ? { cursor: feedCursor } : {}) })
    ).data;
    mineIds.push(mine.items[0]!.id);
    feedIds.push(feed.items[0]!.id);
    if (n === 0)
      expect(feed.items[0]).toEqual({
        id: ordered[0]?.id,
        author: { id: IDS.a, nickname: 'A' },
        text: ordered[0]?.text,
        happenedOn: DATE,
        createdAt: Date.parse(NOW),
        reactionCount: 0,
        myReaction: false,
      });
    mineCursor = mine.nextCursor;
    feedCursor = feed.nextCursor;
    if (n < 2) {
      expect(mineCursor).toBeTruthy();
      expect(feedCursor).toBeTruthy();
    }
  }
  expect(mineIds).toEqual(ordered.map((post) => post.id));
  expect(feedIds).toEqual(ordered.map((post) => post.id));
  expect(mineCursor).toBeNull();
  expect(feedCursor).toBeNull();
  const validationIds = ordered.slice(0, 2).map((post) => post.id);
  const allowed = (await ctx.b.repo.validatePosts({ ids: validationIds })).data;
  expect(allowed.allowedIds).toEqual(validationIds);
  expect((await ctx.c.repo.feed()).data.items).toEqual([]);
  expect((await ctx.c.repo.validatePosts({ ids: [firstId] })).data.allowedIds).toEqual([]);
}

async function modeAndReaction(ctx: Context, p1: string, p2: string): Promise<void> {
  const { a, b, server } = ctx;
  expect((await b.repo.setReaction({ postId: p1, active: true }, { key: key(201) })).data).toEqual({
    postId: p1,
    active: true,
  });
  expect(await reactionRows(ctx)).toHaveLength(1);
  expect((await b.repo.feed()).data.items.find((post) => post.id === p1)).toMatchObject({
    reactionCount: 1,
    myReaction: true,
  });
  expect((await a.repo.feed()).data.items.find((post) => post.id === p1)).toMatchObject({
    reactionCount: 1,
    myReaction: false,
  });
  await expect(
    a.repo.setReaction({ postId: p1, active: true }, { key: key(202) }),
  ).rejects.toMatchObject({ code: 'unavailable' });
  server.env.SOCIAL_MODE = 'read-only';
  expect((await b.repo.validatePosts({ ids: [p1] })).data.allowedIds).toEqual([p1]);
  expect((await b.repo.feed()).data.items.length).toBe(2);
  const beforePosts = await posts(ctx);
  await expect(
    a.repo.createPost({ text: '거절', happenedOn: DATE }, { key: key(203) }),
  ).rejects.toMatchObject({ code: 'social-disabled', retryAfter: 60 });
  expect(await posts(ctx)).toEqual(beforePosts);
  const beforeRejectedReaction = await reactionRows(ctx);
  await expect(
    b.repo.setReaction({ postId: p2, active: true }, { key: key(204) }),
  ).rejects.toMatchObject({ code: 'social-disabled' });
  expect(await reactionRows(ctx)).toEqual(beforeRejectedReaction);
  expect(
    (await b.repo.setReaction({ postId: p1, active: false }, { key: key(205) })).data.active,
  ).toBe(false);
  expect(await reactionRows(ctx)).toEqual([]);
  server.env.SOCIAL_MODE = 'enabled';
  await b.repo.setReaction({ postId: p1, active: true }, { key: key(206) });
}

async function offModeAndRestore(ctx: Context, p1: string, p2: string): Promise<void> {
  const { a, b, server } = ctx;
  server.env.SOCIAL_MODE = 'off';
  expect((await a.repo.myPosts()).data.items).toHaveLength(2);
  const beforeOffPosts = await posts(ctx);
  const beforeOffReactions = await reactionRows(ctx);
  await expect(
    a.repo.createPost({ text: '꺼짐', happenedOn: DATE }, { key: key(215) }),
  ).rejects.toMatchObject({ code: 'social-disabled' });
  await expect(
    b.repo.setReaction({ postId: p2, active: true }, { key: key(216) }),
  ).rejects.toMatchObject({ code: 'social-disabled' });
  expect(await posts(ctx)).toEqual(beforeOffPosts);
  expect(await reactionRows(ctx)).toEqual(beforeOffReactions);
  await expect(b.repo.feed()).rejects.toMatchObject({ code: 'social-disabled', retryAfter: 60 });
  expect(b.seen.at(-1)).toMatchObject({ status: 503, retryAfter: '60', envelopeOk: true });
  await expect(b.repo.validatePosts({ ids: [p1] })).rejects.toMatchObject({
    code: 'social-disabled',
  });
  expect(
    (await b.repo.setReaction({ postId: p1, active: false }, { key: key(207) })).data.active,
  ).toBe(false);
  expect(await reactionRows(ctx)).toEqual([]);
  server.env.SOCIAL_MODE = 'enabled';
  await b.repo.setReaction({ postId: p1, active: true }, { key: key(208) });
  expect(await reactionRows(ctx)).toHaveLength(1);
}

async function revoke(ctx: Context, p1: string): Promise<void> {
  const { b, server } = ctx;
  await server.env.DB.prepare("UPDATE social_pairs SET state='none',version=2 WHERE lo=? AND hi=?")
    .bind(IDS.a, IDS.b)
    .run();
  server.env.SOCIAL_MODE = 'read-only';
  expect((await b.repo.feed()).data.items).toEqual([]);
  expect((await b.repo.validatePosts({ ids: [p1] })).data.allowedIds).toEqual([]);
  const before = await reactionRows(ctx);
  await expect(
    b.repo.setReaction({ postId: p1, active: false }, { key: key(209) }),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(await reactionRows(ctx)).toEqual(before);
}

async function block(ctx: Context, p1: string): Promise<void> {
  const { b, server } = ctx;
  await server.env.DB.prepare(
    "UPDATE social_pairs SET state='accepted',version=3 WHERE lo=? AND hi=?",
  )
    .bind(IDS.a, IDS.b)
    .run();
  await server.env.DB.prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES(?,?,?)')
    .bind(IDS.a, IDS.b, Date.parse(NOW))
    .run();
  expect((await b.repo.feed()).data.items).toEqual([]);
  expect((await b.repo.validatePosts({ ids: [p1] })).data.allowedIds).toEqual([]);
  const before = await reactionRows(ctx);
  await expect(
    b.repo.setReaction({ postId: p1, active: false }, { key: key(210) }),
  ).rejects.toMatchObject({ code: 'unavailable' });
  expect(await reactionRows(ctx)).toEqual(before);
}

async function deletePosts(ctx: Context, p1: string, p2: string): Promise<void> {
  const { a, b, c, server } = ctx;
  server.env.SOCIAL_MODE = 'off';
  const beforePosts = await posts(ctx);
  const beforeReactions = await reactionRows(ctx);
  const foreign = (await b.repo.deletePost({ id: p2 }, { key: key(301) })).data;
  const missing = (await c.repo.deletePost({ id: 'f'.repeat(32) }, { key: key(302) })).data;
  expect(foreign).toEqual({ deleted: true });
  expect(missing).toEqual(foreign);
  expect(await posts(ctx)).toEqual(beforePosts);
  expect(await reactionRows(ctx)).toEqual(beforeReactions);
  expect((await a.repo.deletePost({ id: p1 }, { key: key(303) })).data).toEqual({ deleted: true });
  expect(await reactionRows(ctx)).toEqual([]);
  expect((await posts(ctx)).map((post) => post.id)).toEqual([p2]);
  expect((await a.repo.myPosts()).data.items.map((post) => post.id)).toEqual([p2]);
}

describe('social HTTP adapter feed and commands against Miniflare D1', () => {
  it('keeps post receipts and seeks both feed scopes from the last shown tuple', async () => {
    await withServer(async (server) => {
      const ctx = await seeded(server);
      await pageAndValidate(ctx, await postReplay(ctx));
    });
  }, 30_000);

  it('applies reaction, mode, ACL, and deletion effects through all six paths', async () => {
    await withServer(async (server) => {
      const ctx = await seeded(server);
      const p1 = (await create(ctx, 111, '게시 하나')).id;
      const p2 = (await create(ctx, 112, '게시 둘')).id;
      await modeAndReaction(ctx, p1, p2);
      await offModeAndRestore(ctx, p1, p2);
      await revoke(ctx, p1);
      await block(ctx, p1);
      await deletePosts(ctx, p1, p2);
      const seen = [ctx.a, ctx.b, ctx.c].flatMap((actor) => actor.seen);
      expect(
        new Set(seen.map((call) => `${call.method} ${new URL(call.path, ORIGIN).pathname}`)),
      ).toEqual(
        new Set([
          'GET /api/social/feed',
          'POST /api/social/posts/validate',
          'GET /api/social/posts/mine',
          'POST /api/social/posts',
          'POST /api/social/posts/delete',
          'POST /api/social/reactions/set',
        ]),
      );
      expect(
        seen.every(
          (call) =>
            call.credentials === 'include' &&
            call.cache === 'no-store' &&
            call.headers.get('X-Tasky') === '1' &&
            call.bodyPreserved &&
            call.cacheControl === 'private, no-store' &&
            call.vary === 'Cookie' &&
            call.envelopeOk &&
            (call.method !== 'POST' || call.headers.get('Content-Type') === 'application/json'),
        ),
      ).toBe(true);
    });
  }, 30_000);
});
