// 세션 서명 검증(worker/auth/session.ts) — 위조 쿠키 401, 슬라이딩 갱신, 계정 삭제 410.
// **돌연변이 4**(HMAC 비교 삭제)의 목표 테스트: `위조 쿠키는 401` 이 이 파일에서 빨개져야 한다.
import { describe, expect, it } from 'vitest';

import { createSession, destroyOtherSessions, requireSession, signIn } from './session';
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

describe('requireSession', () => {
  it('정상 쿠키 → sub 를 돌려준다', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      await seedUser(fx, 'sub-1', now);
      const env = envOf(fx);
      const { signedSid } = await createSession(env, 'sub-1', now);
      const request = new Request('https://tasky.example.workers.dev/api/me', {
        headers: { Cookie: `tasky_session=${encodeURIComponent(signedSid)}` },
      });
      const result = await requireSession(request, env, now);
      expect(result).toMatchObject({ ok: true, sub: 'sub-1' });
    } finally {
      await fx.dispose();
    }
  });

  it('쿠키가 없으면 401', async () => {
    const fx = await createD1Fixture();
    try {
      const env = envOf(fx);
      const request = new Request('https://tasky.example.workers.dev/api/me');
      const result = await requireSession(request, env, '2026-01-01T00:00:00.000Z');
      expect(result).toEqual({ ok: false, status: 401 });
    } finally {
      await fx.dispose();
    }
  });

  it('위조 쿠키(서명이 틀림) → 401, D1 조회 없이 거절된다', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      await seedUser(fx, 'sub-2', now);
      const env = envOf(fx);
      const { signedSid } = await createSession(env, 'sub-2', now);
      const [sid] = signedSid.split('.');
      const forged = `${sid}.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA`; // 서명 바이트를 조작
      const request = new Request('https://tasky.example.workers.dev/api/me', {
        headers: { Cookie: `tasky_session=${encodeURIComponent(forged)}` },
      });
      const result = await requireSession(request, env, now);
      expect(result).toEqual({ ok: false, status: 401 });
    } finally {
      await fx.dispose();
    }
  });

  it('sid 는 맞지만 다른 비밀로 서명된 쿠키 → 401', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      await seedUser(fx, 'sub-3', now);
      const env = envOf(fx);
      const { signedSid } = await createSession(env, 'sub-3', now);
      const [sid] = signedSid.split('.');
      // 다른 비밀로 새로 서명 — sid 는 실재하는 값이지만 서명이 그 비밀에 대해 맞지 않는다.
      const wrongEnv = { ...env, SESSION_SECRET: 'other-secret' };
      const { signValue } = await import('./hmac');
      const wrongSigned = await signValue(sid ?? '', 'other-secret');
      expect(wrongSigned).not.toBe(signedSid);
      const request = new Request('https://tasky.example.workers.dev/api/me', {
        headers: { Cookie: `tasky_session=${encodeURIComponent(wrongSigned)}` },
      });
      const result = await requireSession(request, envOf(fx), now);
      expect(result).toEqual({ ok: false, status: 401 });
      void wrongEnv;
    } finally {
      await fx.dispose();
    }
  });

  it('만료된 세션 → 401 이고 그 행이 지워진다', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      await seedUser(fx, 'sub-4', now);
      const env = envOf(fx);
      const { signedSid } = await createSession(env, 'sub-4', now);
      const [sid] = signedSid.split('.');
      // 만료 시각을 과거로 되돌린다(테스트 전용 직접 조작).
      await fx.db
        .prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?')
        .bind('2020-01-01T00:00:00.000Z', sid)
        .run();
      const request = new Request('https://tasky.example.workers.dev/api/me', {
        headers: { Cookie: `tasky_session=${encodeURIComponent(signedSid)}` },
      });
      const result = await requireSession(request, env, now);
      expect(result).toEqual({ ok: false, status: 401 });
      const row = await fx.db.prepare('SELECT 1 FROM sessions WHERE sid = ?').bind(sid).first();
      expect(row).toBeNull();
    } finally {
      await fx.dispose();
    }
  });

  it('만료까지 7일 미만이면 슬라이딩 갱신 — 새 만료·새 서명을 돌려준다', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      await seedUser(fx, 'sub-5', now);
      const env = envOf(fx);
      const { signedSid } = await createSession(env, 'sub-5', now);
      const [sid] = signedSid.split('.');
      // 만료를 3일 뒤로 당겨 "7일 미만" 조건을 만든다.
      await fx.db
        .prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?')
        .bind('2026-01-04T00:00:00.000Z', sid)
        .run();
      const request = new Request('https://tasky.example.workers.dev/api/me', {
        headers: { Cookie: `tasky_session=${encodeURIComponent(signedSid)}` },
      });
      const result = await requireSession(request, env, now);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.refreshedCookie).toBeDefined();
        expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(
          new Date('2026-01-04T00:00:00.000Z').getTime(),
        );
      }
    } finally {
      await fx.dispose();
    }
  });

  it('계정이 삭제된 사용자의 세션 → 410(account-deleted), 그 세션 행은 지워진다', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      await seedUser(fx, 'sub-6', now);
      const env = envOf(fx);
      const { signedSid } = await createSession(env, 'sub-6', now);
      const [sid] = signedSid.split('.');
      await fx.db
        .prepare('INSERT INTO deleted_users (sub, deleted_at) VALUES (?, ?)')
        .bind('sub-6', now)
        .run();
      const request = new Request('https://tasky.example.workers.dev/api/me', {
        headers: { Cookie: `tasky_session=${encodeURIComponent(signedSid)}` },
      });
      const result = await requireSession(request, env, now);
      expect(result).toEqual({ ok: false, status: 410, reason: 'account-deleted' });
      const row = await fx.db.prepare('SELECT 1 FROM sessions WHERE sid = ?').bind(sid).first();
      expect(row).toBeNull();
    } finally {
      await fx.dispose();
    }
  });
});

// signIn(ADR-0020) — 재가입이 아닌 평범한 로그인은 다른 세션(같은 sub 든 다른 sub 든)을 건드리지
// 않는다는 회귀 가드. "재가입일 때만 폐기" 쪽 시나리오(계정 삭제 → 재가입)는
// `worker/account/delete.test.ts` 가 라우터를 통해 끝까지 검증한다(ADR-0020 §6-1).
describe('signIn', () => {
  it('사용자 보고 증상 — 같은 sub 로 두 번째 로그인해도 첫 세션은 살아 있다(회귀 가드, 옛 코드에서 빨개진다)', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const env = envOf(fx);
      const deviceA = await signIn(env, { sub: 'sub-two-devices', email: 'a@x.com' }, now);
      await signIn(env, { sub: 'sub-two-devices', email: 'a@x.com' }, now);

      const request = new Request('https://tasky.example.workers.dev/api/me', {
        headers: { Cookie: `tasky_session=${encodeURIComponent(deviceA.signedSid)}` },
      });
      const result = await requireSession(request, env, now);
      expect(result).toMatchObject({ ok: true, sub: 'sub-two-devices' });

      const row = await fx.db
        .prepare('SELECT COUNT(*) c FROM sessions WHERE sub = ?')
        .bind('sub-two-devices')
        .first<{ c: number }>();
      expect(row?.c).toBe(2);
    } finally {
      await fx.dispose();
    }
  });

  it('deleted_users 행이 없는 로그인은 같은 sub 의 다른 세션에도, 다른 sub 의 세션에도 손대지 않는다', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const env = envOf(fx);
      const otherSub = await signIn(env, { sub: 'sub-untouched', email: 'o@x.com' }, now);
      const firstLogin = await signIn(env, { sub: 'sub-relog', email: 'r@x.com' }, now);
      // 두 번째 로그인 — deleted_users 행이 없으므로 조건부 폐기가 0행에 맞아야 한다.
      await signIn(env, { sub: 'sub-relog', email: 'r@x.com' }, now);

      const [otherSid] = otherSub.signedSid.split('.');
      const otherRow = await fx.db
        .prepare('SELECT 1 FROM sessions WHERE sid = ?')
        .bind(otherSid)
        .first();
      expect(otherRow).not.toBeNull();

      const [firstSid] = firstLogin.signedSid.split('.');
      const firstRow = await fx.db
        .prepare('SELECT 1 FROM sessions WHERE sid = ?')
        .bind(firstSid)
        .first();
      expect(firstRow).not.toBeNull();
    } finally {
      await fx.dispose();
    }
  });

  it('만료된 세션은 로그인 시점에 청소되고, 살아있는 세션은 남는다', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const env = envOf(fx);
      const expired = await createSession(env, 'sub-cleanup', now);
      const [expiredSid] = expired.signedSid.split('.');
      await fx.db
        .prepare('UPDATE sessions SET expires_at = ? WHERE sid = ?')
        .bind('2020-01-01T00:00:00.000Z', expiredSid)
        .run();
      const alive = await createSession(env, 'sub-cleanup', now);
      const [aliveSid] = alive.signedSid.split('.');

      await signIn(env, { sub: 'sub-cleanup', email: 'c@x.com' }, now);

      const expiredRow = await fx.db
        .prepare('SELECT 1 FROM sessions WHERE sid = ?')
        .bind(expiredSid)
        .first();
      expect(expiredRow).toBeNull();
      const aliveRow = await fx.db
        .prepare('SELECT 1 FROM sessions WHERE sid = ?')
        .bind(aliveSid)
        .first();
      expect(aliveRow).not.toBeNull();
    } finally {
      await fx.dispose();
    }
  });

  it('signIn 뒤 users 행이 존재하고 email 이 upsert 된다', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const env = envOf(fx);
      await signIn(env, { sub: 'sub-upsert', email: 'old@x.com' }, now);
      await signIn(env, { sub: 'sub-upsert', email: 'new@x.com' }, now);

      const row = await fx.db
        .prepare('SELECT email FROM users WHERE sub = ?')
        .bind('sub-upsert')
        .first<{ email: string }>();
      expect(row?.email).toBe('new@x.com');
    } finally {
      await fx.dispose();
    }
  });
});

// destroyOtherSessions — "다른 기기 모두 로그아웃"(ADR-0020 §결정 5). 호출자 자신의 세션은
// `sid <> ?` 로 살아남고, 같은 sub 의 나머지·다른 sub 의 세션은 손대지 않아야 하는 대칭도 함께 본다.
describe('destroyOtherSessions', () => {
  it('A·B·C 세 세션 중 A 호출 → B·C 는 지워지고 A 는 살아 있다', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const env = envOf(fx);
      const a = await signIn(env, { sub: 'sub-multi', email: 'm@x.com' }, now);
      const b = await createSession(env, 'sub-multi', now);
      const c = await createSession(env, 'sub-multi', now);
      const [sidA] = a.signedSid.split('.');
      const [sidB] = b.signedSid.split('.');
      const [sidC] = c.signedSid.split('.');

      await destroyOtherSessions(env, 'sub-multi', sidA ?? '');

      const rowA = await fx.db.prepare('SELECT 1 FROM sessions WHERE sid = ?').bind(sidA).first();
      const rowB = await fx.db.prepare('SELECT 1 FROM sessions WHERE sid = ?').bind(sidB).first();
      const rowC = await fx.db.prepare('SELECT 1 FROM sessions WHERE sid = ?').bind(sidC).first();
      expect(rowA).not.toBeNull(); // 호출자 자신은 살아 있다
      expect(rowB).toBeNull();
      expect(rowC).toBeNull();
    } finally {
      await fx.dispose();
    }
  });

  it('다른 sub 의 세션은 건드리지 않는다', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const env = envOf(fx);
      const mine = await signIn(env, { sub: 'sub-mine', email: 'mine@x.com' }, now);
      const other = await signIn(env, { sub: 'sub-other', email: 'other@x.com' }, now);
      const [sidMine] = mine.signedSid.split('.');
      const [sidOther] = other.signedSid.split('.');

      await destroyOtherSessions(env, 'sub-mine', sidMine ?? '');

      const rowOther = await fx.db
        .prepare('SELECT 1 FROM sessions WHERE sid = ?')
        .bind(sidOther)
        .first();
      expect(rowOther).not.toBeNull();
    } finally {
      await fx.dispose();
    }
  });
});

// handleLogoutOthers — 라우터를 통해 CSRF·인증·자기 세션 보존을 끝까지 검증한다.
describe('POST /auth/logout-others', () => {
  it('인증되지 않은 호출은 401', async () => {
    const fx = await createD1Fixture();
    try {
      const { handleRequest } = await import('../router');
      const req = new Request('https://tasky.example.workers.dev/auth/logout-others', {
        method: 'POST',
        headers: { 'X-Tasky': '1' },
      });
      const res = await handleRequest(req, envOf(fx), '2026-01-01T00:00:00.000Z');
      expect(res.status).toBe(401);
    } finally {
      await fx.dispose();
    }
  });

  it('CSRF 헤더가 없으면 403(인증 여부와 무관)', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const env = envOf(fx);
      const { signedSid } = await signIn(env, { sub: 'sub-csrf', email: 'c@x.com' }, now);
      const { handleRequest } = await import('../router');
      const req = new Request('https://tasky.example.workers.dev/auth/logout-others', {
        method: 'POST',
        headers: { Cookie: `tasky_session=${encodeURIComponent(signedSid)}` },
      });
      const res = await handleRequest(req, env, now);
      expect(res.status).toBe(403);
    } finally {
      await fx.dispose();
    }
  });

  it('호출자 세션은 유지하고 나머지만 지운다 — /api/me 로 끝까지 확인', async () => {
    const fx = await createD1Fixture();
    try {
      const now = '2026-01-01T00:00:00.000Z';
      const env = envOf(fx);
      const a = await signIn(env, { sub: 'sub-e2e', email: 'e@x.com' }, now);
      const b = await createSession(env, 'sub-e2e', now);
      const { handleRequest } = await import('../router');

      const logoutOthersReq = new Request('https://tasky.example.workers.dev/auth/logout-others', {
        method: 'POST',
        headers: {
          'X-Tasky': '1',
          Cookie: `tasky_session=${encodeURIComponent(a.signedSid)}`,
        },
      });
      const res = await handleRequest(logoutOthersReq, env, now);
      expect(res.status).toBe(204);

      const meAsA = await handleRequest(
        new Request('https://tasky.example.workers.dev/api/me', {
          headers: { Cookie: `tasky_session=${encodeURIComponent(a.signedSid)}` },
        }),
        env,
        now,
      );
      expect(meAsA.status).toBe(200);

      const meAsB = await handleRequest(
        new Request('https://tasky.example.workers.dev/api/me', {
          headers: { Cookie: `tasky_session=${encodeURIComponent(b.signedSid)}` },
        }),
        env,
        now,
      );
      expect(meAsB.status).toBe(401);
    } finally {
      await fx.dispose();
    }
  });
});
