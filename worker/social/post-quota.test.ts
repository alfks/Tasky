import { describe, expect, it } from 'vitest';

import { createSocialActor } from './actor';
import { createPost } from './post-command';
import { deletePost } from './post-delete';
import { createD1Fixture } from '../test/d1-harness';

const START = Date.UTC(2026, 8, 30, 23, 59, 59, 999);
const EXPIRY = '2099-01-01T00:00:00.000Z';
const PROFILE = 'a'.repeat(32);
const INPUT = { text: '완료', happenedOn: '2026-09-30' };

async function fixture() {
  const fx = await createD1Fixture();
  await fx.db.batch([
    fx.db
      .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
      .bind('quota', 'quota@example.test', EXPIRY),
    fx.db
      .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES(?,?,?,?)')
      .bind('quota-sid', 'quota', '2020-01-01T00:00:00.000Z', EXPIRY),
    fx.db
      .prepare('INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,0,?)')
      .bind(PROFILE, 'quota', 'Quota', START),
  ]);
  let now = START;
  let sequence = 0;
  return {
    fx,
    actor: () =>
      createSocialActor(
        fx.db,
        { ok: true, sub: 'quota', sid: 'quota-sid', expiresAt: EXPIRY },
        now,
      ),
    key: () => `v1.${now}.${(++sequence).toString(16).padStart(32, '0')}`,
    nextDay: () => {
      now += 1;
    },
    count: () =>
      fx.db
        .prepare(
          "SELECT window_start,count FROM social_limits WHERE subject = ? AND bucket = 'post-create' AND window_start = ?",
        )
        .bind(`p:${PROFILE}`, Math.floor(now / 86_400_000) * 86_400_000)
        .first<{ window_start: number; count: number }>(),
  };
}

describe('D1 accepted post quota / R1-08 parity', () => {
  it('20번 create/delete 후 retained capacity가 비어도 daily quota는 유지한다', async () => {
    const test = await fixture();
    try {
      const actor = await test.actor();
      for (let index = 0; index < 20; index += 1) {
        const result = await createPost(actor, test.key(), INPUT);
        expect(result.ok).toBe(true);
        if (!result.ok) throw new Error('quota fixture creation failed');
        expect((await deletePost(actor, test.key(), { id: result.value.id })).ok).toBe(true);
      }
      expect(
        await test.fx.db.prepare('SELECT COUNT(*) AS n FROM social_posts').first<{ n: number }>(),
      ).toEqual({ n: 0 });
      expect(await createPost(actor, test.key(), INPUT)).toEqual({
        ok: false,
        code: 'limit-reached',
      });
      expect((await test.count())?.count).toBe(20);
    } finally {
      await test.fx.dispose();
    }
  }, 30_000);

  it('성공/한도 receipt는 다음 UTC 날에도 재생하며 새 key만 새 날 quota를 쓴다', async () => {
    const test = await fixture();
    try {
      const actor = await test.actor();
      const firstKey = test.key();
      const first = await createPost(actor, firstKey, INPUT);
      expect(first.ok).toBe(true);
      if (!first.ok) throw new Error('quota fixture creation failed');
      await deletePost(actor, test.key(), { id: first.value.id });
      await test.fx.db
        .prepare("UPDATE social_limits SET count = 20 WHERE subject = ? AND bucket = 'post-create'")
        .bind(`p:${PROFILE}`)
        .run();
      const limitedKey = test.key();
      expect(await createPost(actor, limitedKey, INPUT)).toEqual({
        ok: false,
        code: 'limit-reached',
      });
      test.nextDay();
      const nextActor = await test.actor();
      expect(await createPost(nextActor, firstKey, INPUT)).toEqual({
        ok: true,
        value: { id: first.value.id, didApply: false },
      });
      expect(await createPost(nextActor, limitedKey, INPUT)).toEqual({
        ok: false,
        code: 'limit-reached',
      });
      expect(await test.count()).toBeNull();
      expect((await createPost(nextActor, test.key(), INPUT)).ok).toBe(true);
      expect(await test.count()).toEqual({ window_start: START + 1, count: 1 });
      expect(
        await test.fx.db.prepare('SELECT COUNT(*) AS n FROM social_posts').first<{ n: number }>(),
      ).toEqual({ n: 1 });
    } finally {
      await test.fx.dispose();
    }
  }, 30_000);
});
