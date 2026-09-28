import { describe, expect, it } from 'vitest';

import { createSocialActor } from './actor';
import { deletePost } from './post-delete';
import { createD1Fixture } from '../test/d1-harness';

const NOW = 1_800_000_000_000;
const EXPIRY = '2099-01-01T00:00:00.000Z';
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const OWN = '1'.repeat(32);
const FOREIGN = '2'.repeat(32);
const key = (suffix: string) => `v1.${NOW}.${suffix.repeat(32)}`;

describe('post deletion boundary', () => {
  it('자기 글과 반응은 같이 지우고 타인·부재 id는 같은 안전한 성공으로 합친다', async () => {
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
      for (const [id, author] of [
        [OWN, A],
        [FOREIGN, B],
      ])
        await fx.db
          .prepare(
            'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)',
          )
          .bind(id, author, '기록', '2026-09-28', NOW)
          .run();
      await fx.db
        .prepare('INSERT INTO social_reactions(post_id,reactor,created_at) VALUES(?,?,?)')
        .bind(OWN, B, NOW)
        .run();
      const actor = await createSocialActor(
        fx.db,
        { ok: true, sub: 'user-a', sid: 'sid-a', expiresAt: EXPIRY },
        NOW,
      );
      for (const [id, suffix] of [
        [FOREIGN, '1'],
        ['f'.repeat(32), '2'],
        [OWN, '3'],
      ]) {
        expect(await deletePost(actor, key(suffix), { id })).toEqual({
          ok: true,
          value: { deleted: true },
        });
      }
      expect(await deletePost(actor, key('3'), { id: OWN })).toEqual({
        ok: true,
        value: { deleted: true },
      });
      const posts = await fx.db.prepare('SELECT id FROM social_posts').all<{ id: string }>();
      expect(posts.results.map((row) => row.id)).toEqual([FOREIGN]);
      const reactions = await fx.db
        .prepare('SELECT COUNT(*) AS n FROM social_reactions')
        .first<{ n: number }>();
      expect(reactions?.n).toBe(0);
    } finally {
      await fx.dispose();
    }
  }, 15_000);
});
