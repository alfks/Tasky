import { describe, expect, it } from 'vitest';

import { createSocialActor, type SocialActor } from './actor';
import { saveCategory } from './category-command';
import { readCategory, readMyCategories } from './category-read';
import { revokeCategory } from './category-revoke';
import { deleteAccountProjection } from './deletion';
import { readFeedPage } from './feed-read';
import { createPost } from './post-command';
import { readPublicFeed } from './public-feed-read';
import { createD1Fixture } from '../test/d1-harness';

const NOW = 1_800_000_000_000;
const EXPIRY = '2099-01-01T00:00:00.000Z';
const KEY = (n: number) => `v1.${NOW}.${n.toString(16).padStart(32, '0')}`;
const INPUT = {
  expectedVersion: 0,
  name: '공부',
  color: '#7CC6FF',
  visibility: 'friends' as const,
};

async function seed(db: D1Database, sub = 'owner'): Promise<SocialActor> {
  await db.batch([
    db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
      .bind(sub, `${sub}@test.invalid`, EXPIRY),
    db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES(?,?,?,?)')
      .bind(sub, sub, EXPIRY, EXPIRY),
    db
      .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,0,?)')
      .bind(sub === 'owner' ? 'a'.repeat(32) : 'b'.repeat(32), sub, sub, NOW),
  ]);
  return createSocialActor(db, { ok: true, sub, sid: sub, expiresAt: EXPIRY }, NOW);
}

function requireValue<T>(outcome: { ok: true; value: T } | { ok: false }): T {
  if (!outcome.ok) throw new Error('Expected successful command');
  return outcome.value;
}

describe('category authoritative transaction', () => {
  it('CAS·사본수·current canonical 재생·철회·원격 계정 삭제를 함께 검증한다', async () => {
    const fx = await createD1Fixture();
    try {
      const owner = await seed(fx.db);
      const peer = await seed(fx.db, 'peer');
      const category = requireValue(await saveCategory(owner, KEY(1), INPUT));
      expect(category).toMatchObject({ version: 1, postCount: 0 });
      const dto = {
        text: '완료',
        happenedOn: '2026-09-28',
        categoryId: category.id,
        categoryVersion: 1,
      };
      const post = requireValue(await createPost(owner, KEY(2), dto));
      expect(await createPost(peer, KEY(3), dto)).toEqual({ ok: false, code: 'unavailable' });
      const next = requireValue(
        await saveCategory(owner, KEY(4), {
          ...INPUT,
          id: category.id,
          expectedVersion: 1,
          visibility: 'public',
        }),
      );
      expect(next).toMatchObject({ version: 2, postCount: 1 });
      expect(await createPost(owner, KEY(5), dto)).toEqual({ ok: false, code: 'conflict' });
      expect(requireValue(await saveCategory(owner, KEY(1), INPUT))).toMatchObject({
        version: 2,
        visibility: 'public',
      });
      expect(await saveCategory(owner, KEY(1), { ...INPUT, name: '다른' })).toEqual({
        ok: false,
        code: 'idempotency-conflict',
      });
      const context = { db: fx.db, actor: null, policySubs: ['owner'], nowMs: NOW };
      const page = requireValue(
        await readPublicFeed(
          context,
          new URL('https://tasky.test/api/social/public/feed'),
          'secret',
        ),
      );
      expect(page.items.map((item) => item.id)).toEqual([post.id]);
      expect(page.items[0]?.category).not.toHaveProperty('postCount');
      const revoked = requireValue(
        await revokeCategory(owner, KEY(6), { id: category.id, expectedVersion: 2 }),
      );
      expect(revoked).toMatchObject({
        visibility: 'private',
        version: 3,
        revoked: true,
        postCount: 1,
      });
      expect(
        requireValue(
          await readPublicFeed(
            context,
            new URL('https://tasky.test/api/social/public/feed'),
            'secret',
          ),
        ).items,
      ).toEqual([]);
      await fx.db
        .prepare(
          'INSERT INTO social_friend_posts(id,author,category_id,created_at) VALUES(?,?,?,?)',
        )
        .bind(post.id, owner.profileId, category.id, NOW)
        .run();
      await fx.db
        .prepare("INSERT INTO social_pairs(lo,hi,state,version) VALUES(?,?,'accepted',1)")
        .bind(owner.profileId, peer.profileId)
        .run();
      expect(
        requireValue(
          await readFeedPage(peer, new URL('https://tasky.test/api/social/feed'), 'secret', 'feed'),
        ).items,
      ).toEqual([]);
      expect(requireValue(await readCategory(owner, category.id, true))).toMatchObject({
        revoked: true,
      });
      expect(
        requireValue(
          await readMyCategories(
            owner,
            new URL('https://tasky.test/api/social/categories/mine'),
            'secret',
          ),
        ).items,
      ).toHaveLength(1);
      expect(
        await saveCategory(owner, KEY(7), { ...INPUT, id: category.id, expectedVersion: 3 }),
      ).toEqual({ ok: false, code: 'unavailable' });
      await deleteAccountProjection(
        fx.db,
        { ok: true, sub: 'owner', sid: 'owner', expiresAt: EXPIRY },
        'secret',
        NOW,
      );
      for (const table of [
        'social_categories',
        'social_friend_posts',
        'social_public_posts',
        'social_public_categories',
        'social_posts',
      ]) {
        expect(
          (await fx.db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())?.n,
        ).toBe(0);
      }
    } finally {
      await fx.dispose();
    }
  }, 20_000);

  it('효과 실패·후검증 CHECK 실패는 receipt와 공개 membership까지 모두 롤백한다', async () => {
    const fx = await createD1Fixture();
    try {
      const owner = await seed(fx.db);
      await fx.db
        .prepare(
          'CREATE TRIGGER reject_category BEFORE INSERT ON social_categories BEGIN SELECT RAISE(IGNORE); END',
        )
        .run();
      await expect(
        saveCategory(owner, KEY(1), { ...INPUT, visibility: 'public' }),
      ).rejects.toThrow();
      expect(
        (await fx.db.prepare('SELECT COUNT(*) AS n FROM social_commands').first<{ n: number }>())
          ?.n,
      ).toBe(0);
      expect(
        (
          await fx.db
            .prepare('SELECT COUNT(*) AS n FROM social_public_categories')
            .first<{ n: number }>()
        )?.n,
      ).toBe(0);
      await fx.db.prepare('DROP TRIGGER reject_category').run();
      const first = requireValue(await saveCategory(owner, KEY(2), INPUT));
      await fx.db
        .prepare(
          "CREATE TRIGGER reject_category_update BEFORE UPDATE ON social_categories BEGIN SELECT RAISE(ABORT,'blocked'); END",
        )
        .run();
      await expect(
        saveCategory(owner, KEY(3), {
          ...INPUT,
          id: first.id,
          expectedVersion: 1,
          visibility: 'public',
        }),
      ).rejects.toThrow();
      expect(requireValue(await readCategory(owner, first.id, true)).visibility).toBe('friends');
      expect(
        (
          await fx.db
            .prepare('SELECT COUNT(*) AS n FROM social_commands WHERE key = ?')
            .bind(KEY(3))
            .first<{ n: number }>()
        )?.n,
      ).toBe(0);
    } finally {
      await fx.dispose();
    }
  }, 15_000);

  it('동시 범위 변경은 한 CAS만 통과하며 stale 게시·확대는 확정 거절된다', async () => {
    const fx = await createD1Fixture();
    try {
      const owner = await seed(fx.db);
      const first = requireValue(await saveCategory(owner, KEY(1), INPUT));
      requireValue(
        await createPost(owner, KEY(5), {
          text: '기존 사본',
          happenedOn: '2026-09-28',
          categoryId: first.id,
          categoryVersion: 1,
        }),
      );
      const outcomes = await Promise.all([
        saveCategory(owner, KEY(2), {
          ...INPUT,
          id: first.id,
          expectedVersion: 1,
          visibility: 'public',
        }),
        revokeCategory(owner, KEY(3), { id: first.id, expectedVersion: 1 }),
      ]);
      expect(outcomes.filter((result) => result.ok)).toHaveLength(1);
      expect(outcomes.filter((result) => !result.ok)).toHaveLength(1);
      const current = requireValue(await readCategory(owner, first.id, true));
      expect(current.version).toBe(2);
      expect(
        (
          await fx.db
            .prepare('SELECT COUNT(*) AS n FROM social_friend_posts WHERE category_id = ?')
            .bind(first.id)
            .first<{ n: number }>()
        )?.n,
      ).toBe(current.revoked ? 0 : 1);
      expect(
        (
          await createPost(owner, KEY(4), {
            text: 'stale',
            happenedOn: '2026-09-28',
            categoryId: first.id,
            categoryVersion: 1,
          })
        ).ok,
      ).toBe(false);
    } finally {
      await fx.dispose();
    }
  }, 15_000);
});
