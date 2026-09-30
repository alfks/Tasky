import { describe, expect, it } from 'vitest';

import { createSocialActor } from './actor';
import { saveCategory } from './category-command';
import { encodeProjectionCursor, decodeProjectionCursor } from './category-cursor';
import { readCategory, readMyCategories } from './category-read';
import { collectSocialGarbage } from './limits';
import { createD1Fixture } from '../test/d1-harness';

const NOW = 1_800_000_000_000;
const EXPIRY = '2099-01-01T00:00:00.000Z';
const OWNER = 'a'.repeat(32);
const PEER = 'b'.repeat(32);
const key = (n: number) => `v1.${NOW}.${n.toString(16).padStart(32, '0')}`;
const input = { name: '공부', color: '#7CC6FF', expectedVersion: 0, visibility: 'public' as const };

async function seed(db: D1Database) {
  for (const [sub, id] of [
    ['owner', OWNER],
    ['peer', PEER],
  ]) {
    await db.batch([
      db
        .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
        .bind(sub, `${sub}@example.test`, EXPIRY),
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
  return Promise.all(
    ['owner', 'peer'].map((sub) =>
      createSocialActor(db, { ok: true, sub, sid: sub, expiresAt: EXPIRY }, NOW),
    ),
  );
}

function value<T>(result: { ok: true; value: T } | { ok: false }): T {
  if (!result.ok) throw new Error('Expected success');
  return result.value;
}

describe('category ownership and scoped management', () => {
  it('방문자는 소유자 수·철회 여부를 받지 않고 관리 cursor를 빌릴 수 없다', async () => {
    const fx = await createD1Fixture();
    try {
      const [owner, peer] = await seed(fx.db);
      const first = value(await saveCategory(owner, key(1), input));
      await saveCategory(owner, key(2), { ...input, name: '운동' });
      const outsider = value(await readCategory(peer, first.id));
      expect(outsider).not.toHaveProperty('postCount');
      expect(outsider).not.toHaveProperty('revoked');
      expect(await readCategory(peer, first.id, true)).toEqual({ ok: false, code: 'unavailable' });
      const page = value(
        await readMyCategories(
          owner,
          new URL('https://tasky.test/api/social/categories/mine?limit=1'),
          'secret',
        ),
      );
      expect(page.nextCursor).toBeTypeOf('string');
      const stolen = new URL(
        `https://tasky.test/api/social/categories/mine?limit=1&cursor=${page.nextCursor}`,
      );
      expect(await readMyCategories(peer, stolen, 'secret')).toEqual({
        ok: false,
        code: 'validation',
      });
      const next = value(await readMyCategories(owner, stolen, 'secret'));
      expect(next.items).toHaveLength(1);
      expect(next.items[0]?.id).not.toBe(page.items[0]?.id);
      const ownerPrivate = value(
        await saveCategory(
          owner,
          key(3),
          { ...input, id: first.id, expectedVersion: 1, visibility: 'private' },
          'off',
        ),
      );
      expect(ownerPrivate.visibility).toBe('private');
      expect(await readCategory(peer, first.id)).toEqual({ ok: false, code: 'unavailable' });
      expect(
        await saveCategory(owner, key(4), { ...input, id: first.id, expectedVersion: 2 }, 'off'),
      ).toEqual({ ok: false, code: 'social-disabled' });
      expect(
        await saveCategory(
          owner,
          key(5),
          { ...input, id: first.id, expectedVersion: 2, visibility: 'private', name: '편집' },
          'read-only',
        ),
      ).toEqual({ ok: false, code: 'social-disabled' });
    } finally {
      await fx.dispose();
    }
  }, 15_000);

  it('live projection 50개 상한과 소유권 위조는 receipt에서 막는다', async () => {
    const fx = await createD1Fixture();
    try {
      const [owner, peer] = await seed(fx.db);
      await fx.db
        .prepare(
          `WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<50)
        INSERT INTO social_categories(id,owner,name,color,visibility,version,updated_at)
        SELECT printf('%032x',i),?,'category','#7CC6FF','private',1,? FROM n`,
        )
        .bind(OWNER, NOW)
        .run();
      expect(await saveCategory(owner, key(1), input)).toEqual({
        ok: false,
        code: 'limit-reached',
      });
      expect(
        await saveCategory(peer, key(2), {
          ...input,
          id: '1'.padStart(32, '0'),
          expectedVersion: 1,
        }),
      ).toEqual({ ok: false, code: 'unavailable' });
      await fx.db
        .prepare("UPDATE social_categories SET visibility = 'private',deleted_at = ? WHERE id = ?")
        .bind(NOW, '1'.padStart(32, '0'))
        .run();
      expect((await saveCategory(owner, key(3), input)).ok).toBe(true);
    } finally {
      await fx.dispose();
    }
  }, 15_000);

  it('암호화 cursor는 변조·scope·viewer·만료·키 회전을 SQL 전에 거절한다', async () => {
    const scope = `public:feed:${OWNER}`;
    const upper = { id: OWNER, createdAt: NOW };
    const first = await encodeProjectionCursor('secret', 'anonymous', scope, upper, upper, NOW);
    const second = await encodeProjectionCursor('secret', 'anonymous', scope, upper, upper, NOW);
    expect(first).not.toBe(second);
    expect(first).not.toContain(OWNER);
    expect(await decodeProjectionCursor('secret', first, 'anonymous', scope, NOW)).toMatchObject({
      last: upper,
      expiresAt: NOW + 900_000,
    });
    for (const [secret, viewer, filter, time] of [
      ['other', 'anonymous', scope, NOW],
      ['secret', 'owner', scope, NOW],
      ['secret', 'anonymous', 'public:feed:*', NOW],
      ['secret', 'anonymous', scope, NOW + 900_000],
    ] as const)
      expect(await decodeProjectionCursor(secret, first, viewer, filter, time)).toBeNull();
    expect(
      await decodeProjectionCursor('secret', `${first.slice(0, -2)}XX`, 'anonymous', scope, NOW),
    ).toBeNull();
    const renewed = await encodeProjectionCursor(
      'secret',
      'anonymous',
      scope,
      upper,
      upper,
      NOW + 1_000,
      NOW + 900_000,
    );
    expect(
      (await decodeProjectionCursor('secret', renewed, 'anonymous', scope, NOW + 1_000))?.expiresAt,
    ).toBe(NOW + 900_000);
  });
});

describe('empty projection tombstone retention', () => {
  it('48시간 경계와 사본·최근 재철회·live private 보존을 원자적으로 구별한다', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      const old = NOW - 2 * 86_400_000;
      for (const [id, stamp, deleted] of [
        [1, old, old],
        [2, old + 1, old],
        [3, old, old],
        [4, old, null],
      ] as const)
        await fx.db
          .prepare(
            'INSERT INTO social_categories(id,owner,name,color,visibility,version,updated_at,deleted_at) VALUES(?,?,?,?,?,?,?,?)',
          )
          .bind(
            id.toString(16).padStart(32, '0'),
            OWNER,
            '기록',
            '#7CC6FF',
            'private',
            1,
            stamp,
            deleted,
          )
          .run();
      await fx.db
        .prepare(
          'INSERT INTO social_posts(id,author,text,happened_on,created_at,category_id) VALUES(?,?,?,?,?,?)',
        )
        .bind('f'.repeat(32), OWNER, '소유자 사본', '2026-09-28', old, '3'.padStart(32, '0'))
        .run();
      expect(await collectSocialGarbage(fx.db, NOW)).toBe(1);
      const rows = await fx.db
        .prepare('SELECT id FROM social_categories ORDER BY id')
        .all<{ id: string }>();
      expect(rows.results.map((row) => row.id)).toEqual(
        [2, 3, 4].map((id) => id.toString(16).padStart(32, '0')),
      );
      expect(
        (await fx.db.prepare('SELECT COUNT(*) AS n FROM social_posts').first<{ n: number }>())?.n,
      ).toBe(1);
    } finally {
      await fx.dispose();
    }
  }, 15_000);

  it('GC 전체 500행 상한에 빈 tombstone을 포함하며 partial index로 연령을 찾는다', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      const old = NOW - 2 * 86_400_000;
      await fx.db
        .prepare(
          `WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<501)
        INSERT INTO social_categories(id,owner,name,color,visibility,version,updated_at,deleted_at)
        SELECT printf('%032x',i),?,'old','#7CC6FF','private',1,?,? FROM n`,
        )
        .bind(OWNER, old, old)
        .run();
      await fx.db
        .prepare(
          `WITH RECURSIVE n(i) AS (VALUES(1) UNION ALL SELECT i+1 FROM n WHERE i<5)
        INSERT INTO social_commands(actor,key,request_hash,execution_nonce,result_code,created_at)
        SELECT ?,printf('key-%d',i),'hash','nonce','ok',? FROM n`,
        )
        .bind(OWNER, old)
        .run();
      expect(await collectSocialGarbage(fx.db, NOW)).toBe(500);
      expect(
        (await fx.db.prepare('SELECT COUNT(*) AS n FROM social_categories').first<{ n: number }>())
          ?.n,
      ).toBe(6);
      const plan = await fx.db
        .prepare(
          'EXPLAIN QUERY PLAN SELECT cat.id FROM social_categories cat WHERE cat.deleted_at IS NOT NULL AND cat.updated_at <= ? ORDER BY cat.updated_at,cat.id LIMIT 500',
        )
        .bind(NOW)
        .all<{ detail: string }>();
      expect(plan.results.some((row) => row.detail.includes('social_categories_gc'))).toBe(true);
    } finally {
      await fx.dispose();
    }
  }, 15_000);
});
