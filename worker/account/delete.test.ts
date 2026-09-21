// 계정 삭제 — 특히 **다른 기기가 410 로 "삭제됨" 을 구분해 받는지**(ADR-0019 의 핵심 결정)를
// 라우터(`handleRequest`)를 통해 끝까지 확인한다. `POST /api/account/delete` 는 세션·CSRF 를 거쳐야
// 하므로 실제 요청 흐름으로 검증하는 편이 SQL 함수 단위 테스트보다 이 결정의 관찰 가능한 계약에
// 더 가깝다.
import { describe, expect, it } from 'vitest';

import { createSession } from '../auth/session';
import { handleRequest } from '../router';
import { createD1Fixture, type D1Fixture } from '../test/d1-harness';

import type { Env } from '../env';

function envOf(fx: D1Fixture): Env {
  return {
    DB: fx.db,
    ASSETS: {} as Fetcher,
    GOOGLE_CLIENT_ID: 'x',
    GOOGLE_CLIENT_SECRET: 'x',
    SESSION_SECRET: 'test-secret',
  };
}

async function seedUser(fx: D1Fixture, sub: string, now: string) {
  await fx.db
    .prepare('INSERT INTO users (sub, email, created_at) VALUES (?, ?, ?)')
    .bind(sub, `${sub}@x.com`, now)
    .run();
}

function deleteRequest(signedSid: string): Request {
  return new Request('https://tasky.example.workers.dev/api/account/delete', {
    method: 'POST',
    headers: {
      Cookie: `tasky_session=${encodeURIComponent(signedSid)}`,
      'Content-Type': 'application/json',
      'X-Tasky': '1',
    },
    body: '{}',
  });
}

function meRequest(signedSid: string): Request {
  return new Request('https://tasky.example.workers.dev/api/me', {
    headers: { Cookie: `tasky_session=${encodeURIComponent(signedSid)}` },
  });
}

describe('POST /api/account/delete — 순서와 다른 기기의 관측', () => {
  it('삭제한 기기 자신은 204 를 받고 쿠키가 지워진다', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      await seedUser(fx, 'sub-self', now);
      const env = envOf(fx);
      const { signedSid } = await createSession(env, 'sub-self', now);
      const res = await handleRequest(deleteRequest(signedSid), env, now);
      expect(res.status).toBe(204);
      expect(res.headers.get('Set-Cookie')).toMatch(/tasky_session=;.*Max-Age=0/);
    } finally {
      await fx.dispose();
    }
  });

  it('users·entities·devices 가 비고, deleted_users 에 기록이 남는다', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const sub = 'sub-data';
      await seedUser(fx, sub, now);
      const env = envOf(fx);
      const { signedSid } = await createSession(env, sub, now);
      // 삭제 전 데이터를 좀 넣어 둔다.
      await fx.db
        .prepare(
          `INSERT INTO entities (sub, tbl, id, seq, deleted, device_id, updated_at, body)
           VALUES (?, 'todos', 'x', 1, 0, 'dev', ?, '{}')`,
        )
        .bind(sub, now)
        .run();
      await fx.db
        .prepare('INSERT INTO devices (sub, device_id, seen_at) VALUES (?, ?, ?)')
        .bind(sub, 'dev', now)
        .run();

      await handleRequest(deleteRequest(signedSid), env, now);

      const users = await fx.db
        .prepare('SELECT COUNT(*) c FROM users WHERE sub = ?')
        .bind(sub)
        .first<{ c: number }>();
      const entities = await fx.db
        .prepare('SELECT COUNT(*) c FROM entities WHERE sub = ?')
        .bind(sub)
        .first<{ c: number }>();
      const devices = await fx.db
        .prepare('SELECT COUNT(*) c FROM devices WHERE sub = ?')
        .bind(sub)
        .first<{ c: number }>();
      const deletedUsers = await fx.db
        .prepare('SELECT COUNT(*) c FROM deleted_users WHERE sub = ?')
        .bind(sub)
        .first<{ c: number }>();
      expect(users?.c).toBe(0);
      expect(entities?.c).toBe(0);
      expect(devices?.c).toBe(0);
      expect(deletedUsers?.c).toBe(1);
    } finally {
      await fx.dispose();
    }
  });

  it('다른 기기(B)는 계정 삭제 뒤에도 여전히 세션 행이 있고, /api/me 요청에서 410 + account-deleted 를 받는다(평범한 401 이 아니다)', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const sub = 'sub-multi-device';
      await seedUser(fx, sub, now);
      const env = envOf(fx);
      const deviceASession = await createSession(env, sub, now);
      const deviceBSession = await createSession(env, sub, now);

      // A 가 계정을 삭제한다.
      const deleteRes = await handleRequest(deleteRequest(deviceASession.signedSid), env, now);
      expect(deleteRes.status).toBe(204);

      // B 의 세션 행은 삭제 시점에 건드리지 않았어야 한다(ADR-0019 순서 결정).
      const [bSid] = deviceBSession.signedSid.split('.');
      const bRow = await fx.db.prepare('SELECT 1 FROM sessions WHERE sid = ?').bind(bSid).first();
      expect(bRow).not.toBeNull();

      // B 가 다음 요청을 보내면 410 + reason 'account-deleted' — 평범한 401 이 아니다.
      const meRes = await handleRequest(meRequest(deviceBSession.signedSid), env, now);
      expect(meRes.status).toBe(410);
      const body = (await meRes.json()) as { error: string };
      expect(body.error).toBe('account-deleted');

      // 그 요청이 지연 정리를 했으므로, 이제는 세션 행이 사라져 다음 요청부터는 평범한 401.
      const bRowAfter = await fx.db
        .prepare('SELECT 1 FROM sessions WHERE sid = ?')
        .bind(bSid)
        .first();
      expect(bRowAfter).toBeNull();
      const meResAgain = await handleRequest(meRequest(deviceBSession.signedSid), env, now);
      expect(meResAgain.status).toBe(401);
    } finally {
      await fx.dispose();
    }
  });

  it('삭제 뒤 같은 sub 로 재로그인(스텁)하면 deleted_users 기록이 지워지고 새 계정으로 쓸 수 있다', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const sub = 'sub-relogin';
      await seedUser(fx, sub, now);
      const env: Env = { ...envOf(fx), AUTH_STUB: '1' };
      const session = await createSession(env, sub, now);
      await handleRequest(deleteRequest(session.signedSid), env, now);

      const stubRes = await handleRequest(
        new Request(`https://localhost/auth/stub-login?sub=${sub}&email=${sub}@x.com`),
        env,
        now,
      );
      expect(stubRes.status).toBe(302);
      const deletedRow = await fx.db
        .prepare('SELECT 1 FROM deleted_users WHERE sub = ?')
        .bind(sub)
        .first();
      expect(deletedRow).toBeNull();
      const usersRow = await fx.db.prepare('SELECT 1 FROM users WHERE sub = ?').bind(sub).first();
      expect(usersRow).not.toBeNull();
    } finally {
      await fx.dispose();
    }
  });
});
