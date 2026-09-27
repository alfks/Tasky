import { describe, expect, it } from 'vitest';

import { createSession } from '../auth/session';
import { handleRequest } from '../router';
import { socialError } from './http';
import { createD1Fixture } from '../test/d1-harness';

import type { Env } from '../env';

const NOW = '2026-01-01T00:00:00.000Z';
const ORIGIN = 'https://tasky.example.workers.dev';

describe('social retry and cookie', () => {
  it('429/503은 Retry-After를 내고 삭제 쿠키는 갱신 쿠키보다 우선한다', () => {
    const session = {
      ok: true as const,
      sub: 'a',
      sid: 'sid',
      expiresAt: NOW,
      refreshedCookie: 'signed',
    };
    expect(socialError('rate-limited', 59_001, session).headers.get('Retry-After')).toBe('1');
    expect(socialError('social-disabled', 0, session).headers.get('Retry-After')).toBe('60');
    expect(socialError('temporary', 0, session).headers.get('Retry-After')).toBe('30');
    const deleted = socialError('account-deleted', 0, session);
    expect(deleted.headers.get('Set-Cookie')).toContain('Max-Age=0');
    expect(deleted.headers.get('Set-Cookie')).not.toContain('signed');
    expect(deleted.headers.get('Cache-Control')).toContain('no-store');
    expect(deleted.headers.get('Vary')).toBe('Cookie');
  });

  it('슬라이딩 갱신 뒤 D1 예외가 나도 503에 새 쿠키를 보존한다', async () => {
    const fx = await createD1Fixture();
    try {
      const env = {
        DB: fx.db,
        ASSETS: {} as Fetcher,
        GOOGLE_CLIENT_ID: 'x',
        GOOGLE_CLIENT_SECRET: 'x',
        SESSION_SECRET: 'secret',
        SOCIAL_MODE: 'enabled',
        SOCIAL_ALLOWLIST: '["a"]',
      } as Env;
      await fx.db
        .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
        .bind('a', 'a@x.test', NOW)
        .run();
      const signed = await createSession(env, 'a', NOW);
      await fx.db
        .prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?')
        .bind('2026-01-02T00:00:00.000Z', signed.signedSid.split('.')[0])
        .run();
      env.DB = {
        prepare: (query: string) => {
          if (query.includes('SELECT p.id FROM social_profiles p'))
            throw Error('injected D1 error');
          return fx.db.prepare(query);
        },
      } as unknown as D1Database;
      const cookie = `tasky_session=${encodeURIComponent(signed.signedSid)}`;
      const res = await handleRequest(
        new Request(`${ORIGIN}/api/social/me`, {
          headers: { Cookie: cookie },
        }),
        env,
        NOW,
      );
      expect(res.status).toBe(503);
      expect(res.headers.get('Set-Cookie')).toContain('tasky_session=');
      expect(res.headers.get('Set-Cookie')).not.toContain('Max-Age=0');
      expect(res.headers.get('Retry-After')).toBe('30');
    } finally {
      await fx.dispose();
    }
  });

  it('초과 한도 뒤 A 확인과 profile 확인 사이 삭제되면 429/404 대신 410', async () => {
    const fx = await createD1Fixture();
    try {
      const id = 'a'.padStart(32, '0');
      const env = {
        DB: fx.db,
        ASSETS: {} as Fetcher,
        GOOGLE_CLIENT_ID: 'x',
        GOOGLE_CLIENT_SECRET: 'x',
        SESSION_SECRET: 'secret',
        SOCIAL_MODE: 'enabled',
        SOCIAL_ALLOWLIST: '["a"]',
      } as Env;
      await fx.db
        .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
        .bind('a', 'a@x.test', NOW)
        .run();
      await fx.db
        .prepare(
          `INSERT INTO social_profiles(id,sub,nickname,version,created_at)
        VALUES(?,?,?,0,?)`,
        )
        .bind(id, 'a', 'A', Date.parse(NOW))
        .run();
      const signed = await createSession(env, 'a', NOW);
      await fx.db
        .prepare(
          `INSERT INTO social_limits(subject,bucket,window_start,count)
        VALUES(?,'read',?,120)`,
        )
        .bind(`p:${id}`, Date.parse(NOW))
        .run();
      let injected = false;
      env.DB = {
        prepare: (query: string) => {
          if (!query.includes('SELECT p.id, p.nickname, p.version FROM social_profiles p'))
            return fx.db.prepare(query);
          return {
            bind: (...values: unknown[]) => ({
              first: async () => {
                injected = true;
                await fx.db
                  .prepare('INSERT INTO deleted_users(sub,deleted_at) VALUES(?,?)')
                  .bind('a', NOW)
                  .run();
                return fx.db
                  .prepare(query)
                  .bind(...values)
                  .first();
              },
            }),
          };
        },
      } as unknown as D1Database;
      const cookie = `tasky_session=${encodeURIComponent(signed.signedSid)}`;
      const res = await handleRequest(
        new Request(`${ORIGIN}/api/social/friends`, {
          headers: { Cookie: cookie },
        }),
        env,
        NOW,
      );
      expect(injected).toBe(true);
      expect(res.status).toBe(410);
      expect(res.headers.get('Set-Cookie')).toContain('Max-Age=0');
    } finally {
      await fx.dispose();
    }
  });

  it('잘못된 cursor는 인증·read 1회 과금 뒤 400이고 목록 SQL을 호출하지 않는다', async () => {
    const fx = await createD1Fixture();
    try {
      const id = 'a'.padStart(32, '0');
      const env = {
        DB: fx.db,
        ASSETS: {} as Fetcher,
        GOOGLE_CLIENT_ID: 'x',
        GOOGLE_CLIENT_SECRET: 'x',
        SESSION_SECRET: 'secret',
        SOCIAL_MODE: 'enabled',
        SOCIAL_ALLOWLIST: '["a"]',
      } as Env;
      await fx.db
        .prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
        .bind('a', 'a@x.test', NOW)
        .run();
      await fx.db
        .prepare(
          `INSERT INTO social_profiles(id,sub,nickname,version,created_at)
        VALUES(?,?,?,0,?)`,
        )
        .bind(id, 'a', 'A', Date.parse(NOW))
        .run();
      const signed = await createSession(env, 'a', NOW);
      let listQueries = 0;
      env.DB = {
        prepare: (query: string) => {
          if (query.includes('FROM social_pairs pair JOIN social_profiles peer')) listQueries++;
          return fx.db.prepare(query);
        },
      } as unknown as D1Database;
      const url = `${ORIGIN}/api/social/friends?cursor=${id}`;
      const cookie = `tasky_session=${encodeURIComponent(signed.signedSid)}`;
      expect((await handleRequest(new Request(url), env, NOW)).status).toBe(401);
      const res = await handleRequest(new Request(url, { headers: { Cookie: cookie } }), env, NOW);
      expect(res.status).toBe(400);
      expect(listQueries).toBe(0);
      expect(
        (
          await fx.db
            .prepare(
              `SELECT count FROM social_limits WHERE subject = ?
        AND bucket = 'read'`,
            )
            .bind(`p:${id}`)
            .first<{ count: number }>()
        )?.count,
      ).toBe(1);
    } finally {
      await fx.dispose();
    }
  });
});
