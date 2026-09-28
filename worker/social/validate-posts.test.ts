import { describe, expect, it } from 'vitest';

import { createSocialActor } from './actor';
import { validatePosts } from './validate-posts';
import { createD1Fixture } from '../test/d1-harness';

const NOW = 1_800_000_000_000;
const EXPIRY = '2099-01-01T00:00:00.000Z';
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const OWN = '1'.repeat(32);
const PEER = '2'.repeat(32);
const MISSING = '3'.repeat(32);

describe('page-wide post validation', () => {
  it('본문 없이 현재 A/F/V로 allowedIds만 반환하고 차단·부재를 합친다', async () => {
    const fx = await createD1Fixture();
    try {
      for (const [sub, sid, id] of [
        ['user-a', 'sid-a', A],
        ['user-b', 'sid-b', B],
      ]) {
        await fx.db
          .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
          .bind(sub, `${sub}@example.test`, EXPIRY)
          .run();
        await fx.db
          .prepare('INSERT INTO sessions(sid,sub,created_at,expires_at) VALUES(?,?,?,?)')
          .bind(sid, sub, '2020-01-01T00:00:00.000Z', EXPIRY)
          .run();
        await fx.db
          .prepare(
            'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,0,?)',
          )
          .bind(id, sub, sub, NOW)
          .run();
      }
      await fx.db
        .prepare(
          'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(A, B, 'accepted', null, 1, null)
        .run();
      for (const [id, author] of [
        [OWN, A],
        [PEER, B],
      ])
        await fx.db
          .prepare(
            'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)',
          )
          .bind(id, author, 'secret', '2026-09-28', NOW)
          .run();
      const actor = await createSocialActor(
        fx.db,
        { ok: true, sub: 'user-a', sid: 'sid-a', expiresAt: EXPIRY },
        NOW,
      );
      expect(await validatePosts(actor, { ids: [PEER, MISSING, OWN] })).toEqual({
        ok: true,
        value: { allowedIds: [PEER, OWN] },
      });
      await fx.db
        .prepare('INSERT INTO social_blocks(blocker,blocked,created_at) VALUES(?,?,?)')
        .bind(B, A, NOW)
        .run();
      expect(await validatePosts(actor, { ids: [PEER, MISSING, OWN] })).toEqual({
        ok: true,
        value: { allowedIds: [OWN] },
      });
      expect(await validatePosts(actor, { ids: [OWN, OWN] })).toEqual({
        ok: false,
        code: 'validation',
      });
      await fx.db
        .prepare('INSERT INTO deleted_users(sub,deleted_at) VALUES(?,?)')
        .bind('user-a', EXPIRY)
        .run();
      expect(await validatePosts(actor, { ids: [OWN] })).toEqual({
        ok: false,
        code: 'account-deleted',
      });
      await fx.db.prepare('DELETE FROM sessions WHERE sid = ?').bind('sid-a').run();
      expect(await validatePosts(actor, { ids: [] })).toEqual({
        ok: false,
        code: 'unauthorized',
      });
    } finally {
      await fx.dispose();
    }
  }, 15_000);
});
