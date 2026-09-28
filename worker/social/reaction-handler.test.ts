import { describe, expect, it } from 'vitest';

import { createSession } from '../auth/session';
import { handleRequest } from '../router';
import { createD1Fixture } from '../test/d1-harness';

import type { Env } from '../env';

const ISO = '2026-01-01T00:00:00.000Z';
const NOW = Date.parse(ISO);
const ORIGIN = 'https://tasky.example';
const A = 'a'.repeat(32);
const B = 'b'.repeat(32);
const POST = '1'.repeat(32);
const key = (suffix: string) => `v1.${NOW}.${suffix.repeat(32)}`;

function request(path: string, cookie: string, body: string, commandKey?: string): Request {
  return new Request(`${ORIGIN}/api/social${path}`, {
    method: 'POST',
    headers: {
      Cookie: cookie,
      Origin: ORIGIN,
      'X-Tasky': '1',
      'Content-Type': 'application/json',
      ...(commandKey ? { 'Idempotency-Key': commandKey } : {}),
    },
    body,
  });
}

describe('reaction route mode and transport admission', () => {
  it('off 유효 철회는 revoke, 유효 추가는 무과금 503, action 불명 오류는 write 1회', async () => {
    const fx = await createD1Fixture();
    try {
      const env = {
        DB: fx.db,
        SESSION_SECRET: 'secret',
        SOCIAL_MODE: 'off',
        SOCIAL_ALLOWLIST: '["a","b"]',
      } as Env;
      for (const [sub, id] of [
        ['a', A],
        ['b', B],
      ]) {
        await fx.db
          .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
          .bind(sub, `${sub}@example.test`, ISO)
          .run();
        await fx.db
          .prepare(
            'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,0,?)',
          )
          .bind(id, sub, sub, NOW)
          .run();
      }
      const { signedSid } = await createSession(env, 'a', ISO);
      const cookie = `tasky_session=${encodeURIComponent(signedSid)}`;
      await fx.db
        .prepare(
          'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(A, B, 'accepted', null, 1, null)
        .run();
      await fx.db
        .prepare(
          'INSERT INTO social_posts(id,author,text,happened_on,created_at) VALUES(?,?,?,?,?)',
        )
        .bind(POST, B, '기록', '2026-01-01', NOW)
        .run();
      await fx.db
        .prepare('INSERT INTO social_reactions(post_id,reactor,created_at) VALUES(?,?,?)')
        .bind(POST, A, NOW)
        .run();
      const ownBefore = await handleRequest(
        new Request(`${ORIGIN}/api/social/reactions/mine`, { headers: { Cookie: cookie } }),
        env,
        ISO,
      );
      expect(ownBefore.status).toBe(200);
      expect(ownBefore.headers.get('Cache-Control')).toBe('private, no-store');
      expect(await ownBefore.json()).toMatchObject({
        data: { items: [{ postId: POST, createdAt: NOW }], nextCursor: null },
      });
      const path = '/reactions/set';
      const remove = await handleRequest(
        request(path, cookie, JSON.stringify({ postId: POST, active: false }), key('1')),
        env,
        ISO,
      );
      expect(remove.status).toBe(200);
      expect(await remove.json()).toMatchObject({ data: { postId: POST, active: false } });
      const ownAfter = await handleRequest(
        new Request(`${ORIGIN}/api/social/reactions/mine`, { headers: { Cookie: cookie } }),
        env,
        ISO,
      );
      expect(await ownAfter.json()).toMatchObject({ data: { items: [], nextCursor: null } });
      const blocked = await handleRequest(
        request(path, cookie, JSON.stringify({ postId: POST, active: true }), key('2')),
        env,
        ISO,
      );
      expect(blocked.status).toBe(503);
      expect((await handleRequest(request(path, cookie, '{'), env, ISO)).status).toBe(400);
      const badType = new Request(`${ORIGIN}/api/social${path}`, {
        method: 'POST',
        headers: { Cookie: cookie, Origin: ORIGIN, 'X-Tasky': '1', 'Content-Type': 'text/plain' },
        body: '{}',
      });
      expect((await handleRequest(badType, env, ISO)).status).toBe(415);
      const oversized = request(path, cookie, JSON.stringify({ pad: 'x'.repeat(8192) }));
      expect((await handleRequest(oversized, env, ISO)).status).toBe(413);
      const limits = await fx.db
        .prepare('SELECT bucket,count FROM social_limits WHERE subject = ? ORDER BY bucket')
        .bind(`p:${A}`)
        .all<{ bucket: string; count: number }>();
      expect(limits.results).toEqual([
        { bucket: 'read', count: 2 },
        { bucket: 'revoke', count: 1 },
        { bucket: 'write', count: 3 },
      ]);
      env.SOCIAL_MODE = 'enabled';
      const add = await handleRequest(
        request(path, cookie, JSON.stringify({ postId: POST, active: true }), key('3')),
        env,
        ISO,
      );
      expect(add.status).toBe(200);
      await fx.db
        .prepare("UPDATE social_limits SET count = 60 WHERE subject = ? AND bucket = 'write'")
        .bind(`p:${A}`)
        .run();
      env.SOCIAL_MODE = 'off';
      expect(
        (
          await handleRequest(
            request(path, cookie, JSON.stringify({ postId: POST, active: false }), key('4')),
            env,
            ISO,
          )
        ).status,
      ).toBe(200);
      env.SOCIAL_MODE = 'enabled';
      expect(
        (
          await handleRequest(
            request(path, cookie, JSON.stringify({ postId: POST, active: true }), key('5')),
            env,
            ISO,
          )
        ).status,
      ).toBe(429);
      const final = await fx.db
        .prepare('SELECT bucket,count FROM social_limits WHERE subject = ? ORDER BY bucket')
        .bind(`p:${A}`)
        .all<{ bucket: string; count: number }>();
      expect(final.results).toEqual([
        { bucket: 'read', count: 2 },
        { bucket: 'revoke', count: 2 },
        { bucket: 'write', count: 60 },
      ]);
    } finally {
      await fx.dispose();
    }
  }, 20_000);
});
