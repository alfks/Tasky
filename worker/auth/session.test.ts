// 세션 서명 검증(worker/auth/session.ts) — 위조 쿠키 401, 슬라이딩 갱신, 계정 삭제 410.
// **돌연변이 4**(HMAC 비교 삭제)의 목표 테스트: `위조 쿠키는 401` 이 이 파일에서 빨개져야 한다.
import { describe, expect, it } from 'vitest';

import { createSession, requireSession } from './session';
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
