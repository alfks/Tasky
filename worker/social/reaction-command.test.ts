import { describe, expect, it } from 'vitest';

import { createSocialActor } from './actor';
import { setReaction } from './reaction-command';
import { createD1Fixture } from '../test/d1-harness';

const NOW = 1_800_000_000_000;
const EXPIRY = '2099-01-01T00:00:00.000Z';
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const POST = '1'.repeat(32);
const key = (suffix: string) => `v1.${NOW}.${suffix.repeat(32)}`;

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
    .prepare(
      'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES(?,?,?,?,?,?)',
    )
    .bind(A, B, 'accepted', null, 1, null)
    .run();
  await db
    .prepare('INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)')
    .bind(POST, B, '기록', '2026-09-28', NOW)
    .run();
}

describe('desired-state reaction', () => {
  it('현재 ACL의 추가·철회와 확정 receipt 재생을 구분한다', async () => {
    const fx = await createD1Fixture();
    try {
      await seed(fx.db);
      const actor = await createSocialActor(
        fx.db,
        { ok: true, sub: 'user-a', sid: 'sid-a', expiresAt: EXPIRY },
        NOW,
      );
      const add = { postId: POST, active: true };
      expect(await setReaction(actor, key('1'), add)).toEqual({ ok: true, value: add });
      expect(await setReaction(actor, key('1'), add)).toEqual({ ok: true, value: add });
      expect(await setReaction(actor, key('1'), { ...add, active: false })).toEqual({
        ok: false,
        code: 'idempotency-conflict',
      });
      let rows = await fx.db
        .prepare('SELECT COUNT(*) AS n FROM social_reactions')
        .first<{ n: number }>();
      expect(rows?.n).toBe(1);
      await fx.db
        .prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES(?,?,?)')
        .bind(B, A, NOW)
        .run();
      expect(await setReaction(actor, key('2'), { postId: POST, active: true })).toEqual({
        ok: false,
        code: 'unavailable',
      });
      expect(await setReaction(actor, key('3'), { postId: POST, active: false })).toEqual({
        ok: false,
        code: 'unavailable',
      });
      rows = await fx.db
        .prepare('SELECT COUNT(*) AS n FROM social_reactions')
        .first<{ n: number }>();
      expect(rows?.n).toBe(1);
      await fx.db
        .prepare('DELETE FROM social_blocks WHERE blocker = ? AND blocked = ?')
        .bind(B, A)
        .run();
      expect(await setReaction(actor, key('4'), { postId: POST, active: false })).toEqual({
        ok: true,
        value: { postId: POST, active: false },
      });
      rows = await fx.db
        .prepare('SELECT COUNT(*) AS n FROM social_reactions')
        .first<{ n: number }>();
      expect(rows?.n).toBe(0);
      await fx.db
        .prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES(?,?,?)')
        .bind(B, A, NOW)
        .run();
      expect(await setReaction(actor, key('4'), { postId: POST, active: false })).toEqual({
        ok: true,
        value: { postId: POST, active: false },
      });
      await fx.db
        .prepare('DELETE FROM social_blocks WHERE blocker = ? AND blocked = ?')
        .bind(B, A)
        .run();
      await fx.db.prepare('DELETE FROM social_posts WHERE id = ?').bind(POST).run();
      expect(await setReaction(actor, key('5'), { postId: POST, active: true })).toEqual({
        ok: false,
        code: 'unavailable',
      });
      expect(await setReaction(actor, key('6'), { postId: POST, active: false })).toEqual({
        ok: false,
        code: 'unavailable',
      });
      const ownPost = '2'.repeat(32);
      const peerPost = '3'.repeat(32);
      await fx.db
        .prepare(
          'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)',
        )
        .bind(ownPost, A, 'own', '2026-09-28', NOW)
        .run();
      await fx.db
        .prepare(
          'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)',
        )
        .bind(peerPost, B, 'peer', '2026-09-28', NOW)
        .run();
      expect(await setReaction(actor, key('7'), { postId: ownPost, active: false })).toEqual({
        ok: false,
        code: 'unavailable',
      });
      await fx.db
        .prepare("UPDATE social_pairs SET state = 'none' WHERE lo = ? AND hi = ?")
        .bind(A, B)
        .run();
      expect(await setReaction(actor, key('8'), { postId: peerPost, active: false })).toEqual({
        ok: false,
        code: 'unavailable',
      });
      await fx.db
        .prepare("UPDATE social_pairs SET state = 'accepted' WHERE lo = ? AND hi = ?")
        .bind(A, B)
        .run();
      await fx.db
        .prepare('INSERT INTO deleted_users(sub,deleted_at) VALUES(?,?)')
        .bind('user-b', EXPIRY)
        .run();
      expect(await setReaction(actor, key('9'), { postId: peerPost, active: false })).toEqual({
        ok: false,
        code: 'unavailable',
      });
      const successful = await fx.db
        .prepare("SELECT COUNT(*) AS n FROM social_commands WHERE result_code = 'ok'")
        .first<{ n: number }>();
      expect(successful?.n).toBe(2);
    } finally {
      await fx.dispose();
    }
  }, 15_000);
});
