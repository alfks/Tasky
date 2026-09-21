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

/** 스텁 로그인 응답의 `Set-Cookie` 에서 `signIn` 이 돌려준 것과 같은 형태(sid.서명, 디코드된
 * 값)의 signedSid 를 되돌린다 — `meRequest`/`createSession` 이 쓰는 형태와 맞춘다. */
function signedSidFromSetCookie(setCookie: string | null): string {
  const match = setCookie?.match(/tasky_session=([^;]+)/);
  if (!match) throw new Error('Set-Cookie 에 tasky_session 이 없습니다');
  return decodeURIComponent(match[1]);
}

function stubLoginRequest(sub: string): Request {
  return new Request(`https://localhost/auth/stub-login?sub=${sub}&email=${sub}@x.com`);
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

  it('삭제 창 동안 한 번도 요청을 보내지 않은 세션(탈취된 쿠키)은 재가입 뒤에도 되살아나지 않는다', async () => {
    // 리뷰 라운드 2(보안) 재현: 세션 쿠키를 탈취당한 사용자가 그 세션을 무력화하려고 계정을
    // 삭제해도, 그 세션이 삭제 창 동안 한 번도 요청을 보내지 않으면 `sessions` 행은 지연 정리
    // (session.ts#requireSession 의 410 판정)를 거치지 않아 그대로 남는다. 그 상태로 같은 구글
    // 계정이 재가입하면, `deleted_users` 기록만 지우고 `sessions` 를 손대지 않는 예전 순서에서는
    // 그 탈취된 쿠키가 다시 유효해졌다(실 D1 재현됨) — `handleCallback`/`handleStubLogin` 이
    // `deleted_users` 를 지우기 전에 그 sub 의 `sessions` 를 먼저 비우면 이 시나리오는 막힌다.
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const sub = 'sub-stolen-cookie';
      await seedUser(fx, sub, now);
      const env: Env = { ...envOf(fx), AUTH_STUB: '1' };
      const deletingSession = await createSession(env, sub, now);
      // 탈취된 쿠키 — 삭제 창 동안 단 한 번도 요청을 보내지 않는다(지연 정리가 발동할 기회가 없다).
      const stolenSession = await createSession(env, sub, now);

      const deleteRes = await handleRequest(deleteRequest(deletingSession.signedSid), env, now);
      expect(deleteRes.status).toBe(204);

      // 삭제 시점에는 다른 기기의 세션 행을 건드리지 않는다(ADR-0019 순서 결정) — 탈취된 세션도
      // 예외가 아니다. 아직 남아있어야 한다.
      const [stolenSid] = stolenSession.signedSid.split('.');
      const stolenRowBeforeRelogin = await fx.db
        .prepare('SELECT 1 FROM sessions WHERE sid = ?')
        .bind(stolenSid)
        .first();
      expect(stolenRowBeforeRelogin).not.toBeNull();

      // 같은 구글 계정으로 재가입한다(스텁 — handleCallback 과 같은 순서를 탄다).
      const stubRes = await handleRequest(
        new Request(`https://localhost/auth/stub-login?sub=${sub}&email=${sub}@x.com`),
        env,
        now,
      );
      expect(stubRes.status).toBe(302);

      // 탈취된 쿠키로 보낸 요청은 401 이어야 한다 — 평범한 401 인 이유는 재가입이 이미
      // `deleted_users` 기록을 지웠으므로 410(account-deleted) 판정 자체가 더는 발동하지 않기
      // 때문이다(그 세션 행이 재가입 시점에 함께 지워졌다는 뜻).
      const meRes = await handleRequest(meRequest(stolenSession.signedSid), env, now);
      expect(meRes.status).toBe(401);
    } finally {
      await fx.dispose();
    }
  });

  it('탈취 세션과 삭제 창 동안 오프라인이었던 정당한 기기(C) 는 재가입 뒤 둘 다 401 이고, 재가입이 만든 새 세션은 200', async () => {
    // ADR-0020 §3 "남는 위험"의 변형 — 조건부 폐기는 sub 단위라 "누가 탈취했고 누가 정당한지"를
    // 구분하지 못한다. 삭제 창 동안 오프라인이었던 정당한 기기도 재가입 시점에 함께 지워진다(옛
    // 코드와 같은 결과, ADR-0019 §결정 5 괄호 그대로) — 이 테스트는 그 대가가 재가입 이후에도
    // 여전히 사실인지, 그리고 재가입이 만든 새 세션은 정상 동작하는지를 함께 확인한다.
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const sub = 'sub-offline-c';
      await seedUser(fx, sub, now);
      const env: Env = { ...envOf(fx), AUTH_STUB: '1' };
      const deletingSession = await createSession(env, sub, now);
      const stolenSession = await createSession(env, sub, now); // 탈취된 쿠키, 삭제 창 동안 침묵
      const offlineCSession = await createSession(env, sub, now); // 정당한 기기, 삭제 창 동안 오프라인

      const deleteRes = await handleRequest(deleteRequest(deletingSession.signedSid), env, now);
      expect(deleteRes.status).toBe(204);

      const stubRes = await handleRequest(stubLoginRequest(sub), env, now);
      expect(stubRes.status).toBe(302);
      const newSignedSid = signedSidFromSetCookie(stubRes.headers.get('Set-Cookie'));

      const stolenRes = await handleRequest(meRequest(stolenSession.signedSid), env, now);
      expect(stolenRes.status).toBe(401);
      const offlineCRes = await handleRequest(meRequest(offlineCSession.signedSid), env, now);
      expect(offlineCRes.status).toBe(401);

      const newRes = await handleRequest(meRequest(newSignedSid), env, now);
      expect(newRes.status).toBe(200);
    } finally {
      await fx.dispose();
    }
  });

  it('삭제 뒤 재가입을 두 번 연속 해도 첫 재가입 세션은 두 번째 재가입 때문에 지워지지 않는다(EXISTS 가 두 번째엔 거짓)', async () => {
    // ADR-0020 §3 "변형들"의 동시 재가입 레이스 — 여기서는 순차적으로 재현한다. 첫 재가입이
    // deleted_users 표식을 지우고 나면, 곧바로 이어지는 두 번째 재가입(같은 sub)의 조건부 폐기는
    // EXISTS 가 거짓이라 0행에 맞아야 한다 — 첫 재가입이 막 발급한 세션을 두 번째 로그인이 지우면
    // "재가입 뒤 정당한 세션이 곧바로 로그아웃된다"는 새 회귀가 생긴다.
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const sub = 'sub-double-relogin';
      await seedUser(fx, sub, now);
      const env: Env = { ...envOf(fx), AUTH_STUB: '1' };
      const session = await createSession(env, sub, now);
      await handleRequest(deleteRequest(session.signedSid), env, now);

      const firstRes = await handleRequest(stubLoginRequest(sub), env, now);
      const firstSignedSid = signedSidFromSetCookie(firstRes.headers.get('Set-Cookie'));

      const secondRes = await handleRequest(stubLoginRequest(sub), env, now);
      expect(secondRes.status).toBe(302);

      const firstStillOk = await handleRequest(meRequest(firstSignedSid), env, now);
      expect(firstStillOk.status).toBe(200);
    } finally {
      await fx.dispose();
    }
  });
});
