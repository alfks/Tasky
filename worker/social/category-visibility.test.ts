import { describe, expect, it } from 'vitest';

import { VISIBILITY_READ_VECTORS } from '@/domain/social/visibility-vectors';

import { createSocialActor, visiblePost, type SocialActor } from './actor';
import { readCategory } from './category-read';
import { readFeedPage } from './feed-read';
import { readPublicCategories, readPublicFeed } from './public-feed-read';
import { readPublicCategory, readPublicPost, validatePublicPosts } from './public-read';
import { setReaction } from './reaction-command';
import { validatePosts } from './validate-posts';
import { createD1Fixture } from '../test/d1-harness';

const NOW = 1_800_000_000_000;
const EXPIRY = '2099-01-01T00:00:00.000Z';
const OWNER = VISIBILITY_READ_VECTORS[0].facts.ownerId;
const PEER = VISIBILITY_READ_VECTORS.find(
  (vector) => vector.facts.viewerId !== OWNER && vector.facts.viewerId !== null,
)!.facts.viewerId!;
const CATEGORY = 'a'.repeat(32);
const POST = 'b'.repeat(32);
const LEGACY = 'c'.repeat(32);
const KEY = (n: number) => `v1.${NOW}.${n.toString(16).padStart(32, '0')}`;

async function seed(db: D1Database): Promise<{ owner: SocialActor; peer: SocialActor }> {
  for (const [sub, id] of [
    ['owner', OWNER],
    ['peer', PEER],
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
  await db
    .prepare(
      'INSERT INTO social_categories(id,owner,name,color,visibility,version,updated_at) VALUES(?,?,?,?,?,1,?)',
    )
    .bind(CATEGORY, OWNER, '공부', '#7CC6FF', 'friends', NOW)
    .run();
  await db
    .prepare(
      'INSERT INTO social_posts(id,author,text,happened_on,created_at,category_id) VALUES(?,?,?,?,?,?)',
    )
    .bind(POST, OWNER, '확인한 사본', '2026-09-28', NOW, CATEGORY)
    .run();
  return {
    owner: await createSocialActor(
      db,
      { ok: true, sub: 'owner', sid: 'owner', expiresAt: EXPIRY },
      NOW,
    ),
    peer: await createSocialActor(
      db,
      { ok: true, sub: 'peer', sid: 'peer', expiresAt: EXPIRY },
      NOW,
    ),
  };
}

async function friendship(db: D1Database) {
  await db
    .prepare(
      'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES(?,?,?,NULL,1,NULL)',
    )
    .bind(OWNER, PEER, 'accepted')
    .run();
}

function success<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('예상한 성공 결과가 없어요.');
  return result.value;
}

async function assertMatrix(db: D1Database, actors: Awaited<ReturnType<typeof seed>>) {
  let command = 0;
  for (const vector of VISIBILITY_READ_VECTORS) {
    for (const reverse of vector.facts.blocked ? [false, true] : [false]) {
      await db.batch([
        db.prepare('DELETE FROM social_pairs'),
        db.prepare('DELETE FROM social_blocks'),
        db.prepare('DELETE FROM social_reactions'),
      ]);
      await db
        .prepare('UPDATE social_categories SET visibility = ? WHERE id = ?')
        .bind(vector.facts.visibility, CATEGORY)
        .run();
      if (vector.facts.friends) await friendship(db);
      if (vector.facts.blocked)
        await db
          .prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES(?,?,?)')
          .bind(reverse ? OWNER : PEER, reverse ? PEER : OWNER, NOW)
          .run();
      const actor =
        vector.facts.viewerId === null
          ? null
          : vector.facts.viewerId === OWNER
            ? actors.owner
            : actors.peer;
      const context = { db, actor, policySubs: ['owner'], nowMs: NOW };
      const publicReadable = vector.facts.visibility === 'public' && vector.readable;
      expect((await readPublicPost(context, POST)).ok, vector.name).toBe(publicReadable);
      expect((await readPublicCategory(context, CATEGORY)).ok, vector.name).toBe(publicReadable);
      expect(success(await validatePublicPosts(context, [POST])).allowedIds, vector.name).toEqual(
        publicReadable ? [POST] : [],
      );
      expect(
        success(
          await readPublicFeed(
            context,
            new URL('https://tasky.test/api/social/public/feed'),
            'secret',
          ),
        ).items.map((item) => item.id),
        vector.name,
      ).toEqual(publicReadable ? [POST] : []);
      expect(
        success(
          await readPublicCategories(
            context,
            new URL('https://tasky.test/api/social/public/categories'),
            'secret',
          ),
        ).items.map((item) => item.id),
        vector.name,
      ).toEqual(publicReadable ? [CATEGORY] : []);
      if (actor === null) continue;
      expect((await readCategory(actor, CATEGORY)).ok, vector.name).toBe(vector.readable);
      expect((await visiblePost(actor, POST)) !== null, vector.name).toBe(vector.readable);
      expect(success(await validatePosts(actor, { ids: [POST] })).allowedIds, vector.name).toEqual(
        vector.readable ? [POST] : [],
      );
      const friendFeedReadable =
        vector.readable && (actor === actors.owner || vector.facts.friends);
      expect(
        success(
          await readFeedPage(
            actor,
            new URL('https://tasky.test/api/social/feed'),
            'secret',
            'feed',
          ),
        ).items.map((item) => item.id),
        vector.name,
      ).toEqual(friendFeedReadable ? [POST] : []);
      expect(
        (await setReaction(actor, KEY(++command), { postId: POST, active: true })).ok,
        vector.name,
      ).toBe(vector.reactive);
      expect(
        (await db.prepare('SELECT COUNT(*) AS n FROM social_reactions').first<{ n: number }>())?.n,
        vector.name,
      ).toBe(vector.reactive ? 1 : 0);
    }
  }
}

describe('실 D1의 공통 공개범위 벡터', () => {
  it('원본 벡터를 단일조회·목록·검증·응원에서 실행하고 두 방향 차단을 적용한다', async () => {
    const fx = await createD1Fixture();
    try {
      await assertMatrix(fx.db, await seed(fx.db));
    } finally {
      await fx.dispose();
    }
  }, 30_000);

  it('현재 범위 축소와 tombstone은 타인 검증·응원을 끊고 owner 관리 사본을 보존한다', async () => {
    const fx = await createD1Fixture();
    try {
      const actors = await seed(fx.db);
      await fx.db
        .prepare('UPDATE social_categories SET visibility = ? WHERE id = ?')
        .bind('public', CATEGORY)
        .run();
      expect((await setReaction(actors.peer, KEY(1), { postId: POST, active: true })).ok).toBe(
        true,
      );
      const context = { db: fx.db, actor: null, policySubs: ['owner'], nowMs: NOW };
      expect(success(await readPublicPost(context, POST)).reactionCount).toBe(1);
      await fx.db
        .prepare(
          'UPDATE social_categories SET visibility = ?,deleted_at = ?,version = version+1 WHERE id = ?',
        )
        .bind('private', NOW, CATEGORY)
        .run();
      expect(success(await validatePosts(actors.peer, { ids: [POST] })).allowedIds).toEqual([]);
      expect((await setReaction(actors.peer, KEY(2), { postId: POST, active: true })).ok).toBe(
        false,
      );
      expect((await readPublicPost(context, POST)).ok).toBe(false);
      expect(success(await readCategory(actors.owner, CATEGORY))).toMatchObject({
        visibility: 'private',
        revoked: true,
        postCount: 1,
      });
      expect(
        success(
          await readFeedPage(
            actors.owner,
            new URL('https://tasky.test/api/social/posts/mine'),
            'secret',
            'posts:mine',
          ),
        ).items.map((item) => item.id),
      ).toEqual([POST]);
      expect(success(await validatePosts(actors.owner, { ids: [POST] })).allowedIds).toEqual([
        POST,
      ]);
    } finally {
      await fx.dispose();
    }
  }, 15_000);

  it('legacy NULL은 친구 범위를 유지하고 현재 친구의 응원만 집계한다', async () => {
    const fx = await createD1Fixture();
    try {
      const actors = await seed(fx.db);
      await fx.db
        .prepare(
          'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)',
        )
        .bind(LEGACY, OWNER, '기존 공유', '2026-09-28', NOW)
        .run();
      expect(await visiblePost(actors.peer, LEGACY)).toBeNull();
      await friendship(fx.db);
      expect(await visiblePost(actors.peer, LEGACY)).not.toBeNull();
      expect((await setReaction(actors.peer, KEY(1), { postId: LEGACY, active: true })).ok).toBe(
        true,
      );
      await fx.db.prepare('DELETE FROM social_pairs').run();
      expect(success(await validatePosts(actors.peer, { ids: [LEGACY] })).allowedIds).toEqual([]);
      expect(
        success(
          await readFeedPage(
            actors.owner,
            new URL('https://tasky.test/api/social/posts/mine'),
            'secret',
            'posts:mine',
          ),
        ).items.find((item) => item.id === LEGACY)?.reactionCount,
      ).toBe(0);
      expect(
        (
          await readPublicPost(
            { db: fx.db, actor: null, policySubs: ['owner'], nowMs: NOW },
            LEGACY,
          )
        ).ok,
      ).toBe(false);
    } finally {
      await fx.dispose();
    }
  }, 15_000);
});
