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
const key = (suffix: string) => `v1.${NOW}.${suffix.repeat(32)}`;

function request(path: string, cookie: string, body?: unknown, commandKey?: string): Request {
  return new Request(`${ORIGIN}/api/social${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Cookie: cookie,
      ...(body === undefined
        ? {}
        : {
            Origin: ORIGIN,
            'X-Tasky': '1',
            'Content-Type': 'application/json',
          }),
      ...(commandKey ? { 'Idempotency-Key': commandKey } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('post HTTP routes', () => {
  it('공유 생성·feed·validate·mine·철회가 모드와 공개 DTO를 지킨다', async () => {
    const fx = await createD1Fixture();
    try {
      const env = {
        DB: fx.db,
        SESSION_SECRET: 'secret',
        SOCIAL_MODE: 'enabled',
        SOCIAL_ALLOWLIST: '["a","b"]',
      } as Env;
      const cookies: Record<string, string> = {};
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
        const signed = await createSession(env, sub, ISO);
        cookies[sub] = `tasky_session=${encodeURIComponent(signed.signedSid)}`;
      }
      await fx.db
        .prepare(
          'INSERT INTO social_pairs(lo,hi,state,requester,version,requested_at) VALUES(?,?,?,?,?,?)',
        )
        .bind(A, B, 'accepted', null, 1, null)
        .run();
      const payload = { text: '  완료  ', happenedOn: '2026-01-01' };
      const created = await handleRequest(
        request('/posts', cookies.a, payload, key('1')),
        env,
        ISO,
      );
      expect(created.status).toBe(201);
      const createdJson = (await created.json()) as { data: { id: string } };
      expect(createdJson.data.id).toMatch(/^[0-9a-f]{32}$/u);
      const replay = await handleRequest(request('/posts', cookies.a, payload, key('1')), env, ISO);
      expect(replay.status).toBe(200);
      expect(await replay.json()).toMatchObject({ data: { id: createdJson.data.id } });
      env.SOCIAL_MODE = 'read-only';
      const feed = await handleRequest(request('/feed', cookies.b), env, ISO);
      expect(feed.status).toBe(200);
      expect(await feed.json()).toMatchObject({
        data: { items: [{ id: createdJson.data.id, text: '완료', author: { id: A } }] },
      });
      const valid = await handleRequest(
        request('/posts/validate', cookies.b, { ids: [createdJson.data.id] }),
        env,
        ISO,
      );
      expect(await valid.json()).toMatchObject({ data: { allowedIds: [createdJson.data.id] } });
      expect(
        (await handleRequest(request('/posts', cookies.a, payload, key('2')), env, ISO)).status,
      ).toBe(503);
      env.SOCIAL_MODE = 'off';
      const mine = await handleRequest(request('/posts/mine', cookies.a), env, ISO);
      expect(await mine.json()).toMatchObject({ data: { items: [{ id: createdJson.data.id }] } });
      expect((await handleRequest(request('/feed', cookies.b), env, ISO)).status).toBe(503);
      const reused = await handleRequest(
        request('/posts/delete', cookies.a, { id: createdJson.data.id }, key('1')),
        env,
        ISO,
      );
      expect(reused.status).toBe(409);
      expect(await reused.json()).toMatchObject({ error: { code: 'idempotency-conflict' } });
      expect(
        (
          await handleRequest(
            request('/posts/delete', cookies.a, { id: createdJson.data.id }, key('3')),
            env,
            ISO,
          )
        ).status,
      ).toBe(200);
      env.SOCIAL_MODE = 'read-only';
      const after = await handleRequest(request('/feed', cookies.b), env, ISO);
      expect(await after.json()).toMatchObject({ data: { items: [], nextCursor: null } });
    } finally {
      await fx.dispose();
    }
  }, 30_000);

  it('validate는 CSRF·세션·8KiB 뒤 read 예산을 정확히 한 번 쓰고 쿠키를 갱신한다', async () => {
    const fx = await createD1Fixture();
    try {
      const env = {
        DB: fx.db,
        SESSION_SECRET: 'secret',
        SOCIAL_MODE: 'read-only',
        SOCIAL_ALLOWLIST: '["a"]',
      } as Env;
      await fx.db
        .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
        .bind('a', 'a@example.test', ISO)
        .run();
      await fx.db
        .prepare(
          'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,0,?)',
        )
        .bind(A, 'a', 'A', NOW)
        .run();
      const { signedSid } = await createSession(env, 'a', ISO);
      const cookie = `tasky_session=${encodeURIComponent(signedSid)}`;
      const path = `${ORIGIN}/api/social/posts/validate`;
      const headers = {
        Cookie: cookie,
        Origin: ORIGIN,
        'X-Tasky': '1',
        'Content-Type': 'application/json',
      };
      const csrf = new Request(path, {
        method: 'POST',
        headers: { Cookie: cookie },
        body: '{}',
      });
      expect((await handleRequest(csrf, env, ISO)).status).toBe(403);
      const noAuth = new Request(path, {
        method: 'POST',
        headers: { ...headers, Cookie: '' },
        body: '{}',
      });
      expect((await handleRequest(noAuth, env, ISO)).status).toBe(401);
      const badType = new Request(path, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'text/plain' },
        body: '{}',
      });
      expect((await handleRequest(badType, env, ISO)).status).toBe(415);
      const oversized = new Request(path, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: [], pad: 'x'.repeat(8192) }),
      });
      expect((await handleRequest(oversized, env, ISO)).status).toBe(413);
      await fx.db
        .prepare('UPDATE sessions SET expires_at = ? WHERE sub = ?')
        .bind('2026-01-02T00:00:00.000Z', 'a')
        .run();
      const good = await handleRequest(request('/posts/validate', cookie, { ids: [] }), env, ISO);
      expect(good.status).toBe(200);
      expect(good.headers.get('Set-Cookie')).toContain('tasky_session=');
      expect(await good.json()).toMatchObject({ data: { allowedIds: [] } });
      const read = await fx.db
        .prepare("SELECT count FROM social_limits WHERE subject = ? AND bucket = 'read'")
        .bind(`p:${A}`)
        .first<{ count: number }>();
      expect(read?.count).toBe(3);
      await fx.db
        .prepare("UPDATE social_limits SET count = 120 WHERE subject = ? AND bucket = 'read'")
        .bind(`p:${A}`)
        .run();
      const limited = await handleRequest(
        request('/posts/validate', cookie, { ids: [] }),
        env,
        ISO,
      );
      expect(limited.status).toBe(429);
      expect(limited.headers.get('Retry-After')).toBeTruthy();
      const commands = await fx.db
        .prepare('SELECT COUNT(*) AS n FROM social_commands')
        .first<{ n: number }>();
      expect(commands?.n).toBe(0);
    } finally {
      await fx.dispose();
    }
  }, 30_000);
});
