import { describe, expect, it } from 'vitest';

import { createSocialActor } from './actor';
import { saveCategory } from './category-command';
import { createPost } from './post-command';
import { deletePost } from './post-delete';
import { createD1Fixture } from '../test/d1-harness';

const NOW = 1_800_000_000_000;
const EXPIRY = '2099-01-01T00:00:00.000Z';
const PROFILE = 'a'.repeat(32);
const KEY = `v1.${NOW}.${'1'.repeat(32)}`;

async function seed(db: D1Database): Promise<void> {
  await db.batch([
    db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
      .bind('actor', 'actor@example.test', EXPIRY),
    db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES(?,?,?,?)')
      .bind('sid', 'actor', '2020-01-01T00:00:00.000Z', EXPIRY),
  ]);
  await db
    .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,0,?)')
    .bind(PROFILE, 'actor', 'Actor', NOW)
    .run();
}

describe('post creation transaction', () => {
  it('사본·receipt·성공 일일 카운터를 한 번 적용하고 재생/키충돌을 분리한다', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      const actor = await createSocialActor(
        fx.db,
        { ok: true, sub: 'actor', sid: 'sid', expiresAt: EXPIRY },
        NOW,
      );
      const input = { text: '  완료  ', happenedOn: '2026-09-28' };
      const first = await createPost(actor, KEY, input);
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error('creation failed');
      expect(first.value.didApply).toBe(true);
      expect(first.value.id).toMatch(/^[0-9a-f]{32}$/u);
      const row = await fx.db
        .prepare('SELECT text,happened_on FROM social_posts WHERE id = ?')
        .bind(first.value.id)
        .first<{ text: string; happened_on: string }>();
      expect(row).toEqual({ text: '완료', happened_on: '2026-09-28' });
      const replay = await createPost(actor, KEY, input);
      expect(replay).toEqual({ ok: true, value: { id: first.value.id, didApply: false } });
      expect(await createPost(actor, KEY, { ...input, text: '다른 글' })).toEqual({
        ok: false,
        code: 'idempotency-conflict',
      });
      const daily = await fx.db
        .prepare("SELECT count FROM social_limits WHERE subject = ? AND bucket = 'post-create'")
        .bind(`p:${PROFILE}`)
        .first<{ count: number }>();
      expect(daily?.count).toBe(1);
    } finally {
      await fx.dispose();
    }
  }, 15_000);

  it('일간 생성량 한도는 receipt로 확정하고 새 post 효과를 막는다', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      const actor = await createSocialActor(
        fx.db,
        { ok: true, sub: 'actor', sid: 'sid', expiresAt: EXPIRY },
        NOW,
      );
      const dayStart = Math.floor(NOW / 86_400_000) * 86_400_000;
      await fx.db
        .prepare('INSERT INTO social_limits(subject,bucket,window_start,count) VALUES(?,?,?,?)')
        .bind(`p:${PROFILE}`, 'post-create', dayStart, 20)
        .run();
      expect(await createPost(actor, KEY, { text: '완료', happenedOn: '2026-09-28' })).toEqual({
        ok: false,
        code: 'limit-reached',
      });
      const posts = await fx.db
        .prepare('SELECT COUNT(*) AS n FROM social_posts')
        .first<{ n: number }>();
      expect(posts?.n).toBe(0);
    } finally {
      await fx.dispose();
    }
  }, 15_000);

  it('보유 1,000개 상한은 현재 post 수로 검사하고 성공 생성량을 쓰지 않는다', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      await fx.db
        .prepare(
          `WITH RECURSIVE n(i) AS (
        VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i < 1000
      ) INSERT INTO social_posts(id,author,text,happened_on,created_at)
        SELECT printf('%032x',i),?,'기존 글','2026-09-28',? FROM n`,
        )
        .bind(PROFILE, NOW - 1)
        .run();
      const actor = await createSocialActor(
        fx.db,
        { ok: true, sub: 'actor', sid: 'sid', expiresAt: EXPIRY },
        NOW,
      );
      expect(await createPost(actor, KEY, { text: '새 글', happenedOn: '2026-09-28' })).toEqual({
        ok: false,
        code: 'limit-reached',
      });
      const daily = await fx.db
        .prepare("SELECT count FROM social_limits WHERE subject = ? AND bucket = 'post-create'")
        .bind(`p:${PROFILE}`)
        .first<{ count: number }>();
      expect(daily).toBeNull();
      const posts = await fx.db
        .prepare('SELECT COUNT(*) AS n FROM social_posts')
        .first<{ n: number }>();
      expect(posts?.n).toBe(1000);
    } finally {
      await fx.dispose();
    }
  }, 30_000);

  it('post 효과가 실패하면 receipt와 일간 생성량도 함께 롤백한다', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      await fx.db
        .prepare(
          `CREATE TRIGGER fail_post BEFORE INSERT ON social_posts
        BEGIN SELECT RAISE(ABORT, 'blocked'); END`,
        )
        .run();
      const actor = await createSocialActor(
        fx.db,
        { ok: true, sub: 'actor', sid: 'sid', expiresAt: EXPIRY },
        NOW,
      );
      await expect(
        createPost(actor, KEY, { text: '새 글', happenedOn: '2026-09-28' }),
      ).rejects.toThrow();
      const receipt = await fx.db
        .prepare('SELECT COUNT(*) AS n FROM social_commands')
        .first<{ n: number }>();
      const daily = await fx.db
        .prepare("SELECT COUNT(*) AS n FROM social_limits WHERE bucket = 'post-create'")
        .first<{ n: number }>();
      expect(receipt?.n).toBe(0);
      expect(daily?.n).toBe(0);
    } finally {
      await fx.dispose();
    }
  }, 15_000);
});

describe('public membership transaction', () => {
  it('public post RETURNING은 trigger 영향을 구분하고 hint 실패는 사본과 receipt를 롤백한다', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      const actor = await createSocialActor(
        fx.db,
        { ok: true, sub: 'actor', sid: 'sid', expiresAt: EXPIRY },
        NOW,
      );
      const cat = await saveCategory(actor, KEY, {
        name: '공부',
        color: '#7CC6FF',
        expectedVersion: 0,
        visibility: 'public',
      });
      if (!cat.ok) throw new Error('category failed');
      const dto = {
        text: '공개',
        happenedOn: '2026-09-28',
        categoryId: cat.value.id,
        categoryVersion: 1,
      };
      const second = `v1.${NOW}.${'2'.repeat(32)}`;
      const post = await createPost(actor, second, dto);
      expect(post.ok).toBe(true);
      if (!post.ok) throw new Error('post failed');
      expect(post.value.didApply).toBe(true);
      expect(await createPost(actor, second, dto)).toEqual({
        ok: true,
        value: { id: post.value.id, didApply: false },
      });
      expect(
        (
          await fx.db
            .prepare('SELECT COUNT(*) AS n FROM social_public_posts')
            .first<{ n: number }>()
        )?.n,
      ).toBe(1);
      await deletePost(actor, `v1.${NOW}.${'3'.repeat(32)}`, { id: post.value.id });
      expect(
        (
          await fx.db
            .prepare('SELECT COUNT(*) AS n FROM social_public_posts')
            .first<{ n: number }>()
        )?.n,
      ).toBe(0);
      await fx.db
        .prepare(
          'CREATE TRIGGER skip_hint BEFORE INSERT ON social_public_posts BEGIN SELECT RAISE(IGNORE); END',
        )
        .run();
      const failedKey = `v1.${NOW}.${'4'.repeat(32)}`;
      await expect(createPost(actor, failedKey, dto)).rejects.toThrow();
      expect(
        (await fx.db.prepare('SELECT COUNT(*) AS n FROM social_posts').first<{ n: number }>())?.n,
      ).toBe(0);
      expect(
        (
          await fx.db
            .prepare('SELECT COUNT(*) AS n FROM social_commands WHERE key = ?')
            .bind(failedKey)
            .first<{ n: number }>()
        )?.n,
      ).toBe(0);
      expect(
        (
          await fx.db
            .prepare("SELECT count FROM social_limits WHERE subject = ? AND bucket = 'post-create'")
            .bind(`p:${PROFILE}`)
            .first<{ count: number }>()
        )?.count,
      ).toBe(1);
    } finally {
      await fx.dispose();
    }
  }, 15_000);
});
