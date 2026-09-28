import { describe, expect, it } from 'vitest';

import { createHttpSocialRepository } from '@/infra/social/http-repository';

import { createSocialActor } from './actor';
import { OWN_REACTION_READ_SQL, readOwnReactions } from './reaction-read';
import { createD1Fixture } from '../test/d1-harness';
import { key, withServer } from '../test/social-adapter-integration-fixture';

const NOW = 1_800_000_000_000;
const EXPIRY = '2099-01-01T00:00:00.000Z';
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const SECRET = 'reaction-read-secret';
const POST = (value: number) => value.toString(16).padStart(32, '0');
const url = (query = '') => new URL(`https://tasky.example/api/social/reactions/mine${query}`);

async function seed(db: D1Database): Promise<void> {
  for (const [sub, sid, id] of [
    ['user-a', 'sid-a', A],
    ['user-b', 'sid-b', B],
  ]) {
    await db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
      .bind(sub, `${sub}@example.test`, EXPIRY)
      .run();
    await db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES(?,?,?,?)')
      .bind(sid, sub, '2020-01-01T00:00:00.000Z', EXPIRY)
      .run();
    await db
      .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,0,?)')
      .bind(id, sub, sub, NOW)
      .run();
  }
  await db
    .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES(?,?,?,?)')
    .bind('sid-a2', 'user-a', '2020-01-01T00:00:00.000Z', EXPIRY)
    .run();
  await db
    .prepare(
      'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES(?,?,?,?,?,?)',
    )
    .bind(A, B, 'accepted', null, 1, null)
    .run();
  for (let i = 1; i <= 22; i += 1) {
    await db
      .prepare('INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)')
      .bind(POST(i), B, `비공개 본문 ${i}`, '2026-09-28', NOW + i)
      .run();
    await db
      .prepare('INSERT INTO social_reactions(post_id,reactor,created_at) VALUES(?,?,?)')
      .bind(POST(i), A, NOW + i)
      .run();
  }
}

async function actor(db: D1Database, sub: string, sid: string, now = NOW) {
  return createSocialActor(db, { ok: true, sub, sid, expiresAt: EXPIRY }, now);
}

describe('본인 응원 목록 D1 읽기', () => {
  it('26번째 HTTP adapter→Worker→D1 경로는 off에서도 최소 DTO와 철회를 연결한다', async () => {
    await withServer(async (server) => {
      const [a, b] = await Promise.all([server.actor('a'), server.actor('b')]);
      for (const [sub, id] of [
        ['a', A],
        ['b', B],
      ]) {
        await server.env.DB.prepare(
          'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,?,?)',
        )
          .bind(id, sub, sub, 0, Date.parse(server.clock.value))
          .run();
      }
      await server.env.DB.prepare(
        "INSERT INTO social_pairs(lo,hi,state,requester,version) VALUES(?,?,'accepted',NULL,1)",
      )
        .bind(A, B)
        .run();
      await server.env.DB.prepare(
        'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)',
      )
        .bind(POST(1), B, '타인 본문', '2026-01-01', Date.parse(server.clock.value))
        .run();
      await server.env.DB.prepare(
        'INSERT INTO social_reactions(post_id,reactor,created_at) VALUES(?,?,?)',
      )
        .bind(POST(1), A, Date.parse(server.clock.value))
        .run();
      server.env.SOCIAL_MODE = 'off';
      const repo = createHttpSocialRepository(a.transport);
      const first = (await repo.myReactions()).data;
      expect(first).toEqual({
        items: [{ postId: POST(1), createdAt: Date.parse(server.clock.value) }],
        nextCursor: null,
      });
      expect(a.seen.at(-1)).toMatchObject({
        path: '/api/social/reactions/mine',
        method: 'GET',
        status: 200,
        cacheControl: 'private, no-store',
        vary: 'Cookie',
        envelopeOk: true,
      });
      expect((await createHttpSocialRepository(b.transport).myReactions()).data.items).toEqual([]);
      await repo.setReaction({ postId: POST(1), active: false }, { key: key(7) });
      expect((await repo.myReactions()).data.items).toEqual([]);
    });
  }, 20_000);

  it('인덱스 seek로 20/21 경계를 넘고 sid·actor·scope·TTL 다른 cursor를 거절한다', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      const current = await actor(fx.db, 'user-a', 'sid-a');
      const first = await readOwnReactions(current, url(), SECRET);
      if (!first.ok) throw new Error(`first page failed: ${first.code}`);
      expect(first.value.items).toHaveLength(20);
      expect(first.value.items[0]).toEqual({ postId: POST(1), createdAt: NOW + 1 });
      expect(
        first.value.items.every(
          (item) => Object.keys(item).sort().join(',') === 'createdAt,postId',
        ),
      ).toBe(true);
      expect(first.value.nextCursor).not.toBeNull();
      const next = await readOwnReactions(
        current,
        url(`?cursor=${encodeURIComponent(first.value.nextCursor!)}`),
        SECRET,
      );
      expect(next).toMatchObject({
        ok: true,
        value: { items: [{ postId: POST(21) }, { postId: POST(22) }], nextCursor: null },
      });
      for (const different of [
        await actor(fx.db, 'user-a', 'sid-a2'),
        await actor(fx.db, 'user-b', 'sid-b'),
      ]) {
        expect(
          await readOwnReactions(
            different,
            url(`?cursor=${encodeURIComponent(first.value.nextCursor!)}`),
            SECRET,
          ),
        ).toEqual({ ok: false, code: 'validation' });
      }
      expect(await readOwnReactions(current, url('?cursor=feed'), SECRET)).toEqual({
        ok: false,
        code: 'validation',
      });
      expect(await readOwnReactions(current, url('?unexpected=1'), SECRET)).toEqual({
        ok: false,
        code: 'validation',
      });
      expect(
        await readOwnReactions(
          await actor(fx.db, 'user-a', 'sid-a', NOW + 900_000),
          url(`?cursor=${encodeURIComponent(first.value.nextCursor!)}`),
          SECRET,
        ),
      ).toEqual({ ok: false, code: 'validation' });
      const plan = await fx.db
        .prepare(`EXPLAIN QUERY PLAN ${OWN_REACTION_READ_SQL}`)
        .bind(A, '', A, 'user-a', 'sid-a', current.nowIso, 21)
        .all<{ detail: string }>();
      expect(plan.results.map((row) => row.detail).join(' ')).toContain(
        'social_reactions_reactor_post',
      );
    } finally {
      await fx.dispose();
    }
  }, 20_000);

  it('차단·관계 해제·작성자 삭제를 LIMIT 전에 거르고 세션 철회를 실패로 돌린다', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      const current = await actor(fx.db, 'user-a', 'sid-a');
      await fx.db
        .prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES(?,?,?)')
        .bind(B, A, NOW)
        .run();
      expect(await readOwnReactions(current, url(), SECRET)).toEqual({
        ok: true,
        value: { items: [], nextCursor: null },
      });
      await fx.db.prepare('DELETE FROM social_blocks WHERE blocker=?').bind(B).run();
      await fx.db
        .prepare("UPDATE social_pairs SET state='none' WHERE lo=? AND hi=?")
        .bind(A, B)
        .run();
      expect(await readOwnReactions(current, url(), SECRET)).toMatchObject({
        ok: true,
        value: { items: [] },
      });
      await fx.db
        .prepare("UPDATE social_pairs SET state='accepted' WHERE lo=? AND hi=?")
        .bind(A, B)
        .run();
      await fx.db
        .prepare('INSERT INTO deleted_users(sub,deleted_at) VALUES(?,?)')
        .bind('user-b', EXPIRY)
        .run();
      expect(await readOwnReactions(current, url(), SECRET)).toMatchObject({
        ok: true,
        value: { items: [] },
      });
      await fx.db.prepare('DELETE FROM deleted_users WHERE sub=?').bind('user-b').run();
      await fx.db.prepare('DELETE FROM sessions WHERE sid=?').bind('sid-a').run();
      expect(await readOwnReactions(current, url(), SECRET)).toEqual({
        ok: false,
        code: 'unauthorized',
      });
    } finally {
      await fx.dispose();
    }
  }, 20_000);
});
