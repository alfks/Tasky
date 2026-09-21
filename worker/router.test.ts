// 라우터 계약: CSRF(403)·본문 상한(413)·쿠키 속성·404·`/api/sync` 두 기기 왕복.
// **돌연변이 5**(CSRF 헤더 검사 삭제)의 목표: "CSRF 헤더 없는 POST → 403" 이 이 파일에서 빨개져야
// 한다.
import { describe, expect, it } from 'vitest';

import { createSession } from './auth/session';
import { handleRequest } from './router';
import { createD1Fixture, type D1Fixture } from './test/d1-harness';

import type { Env } from './env';

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

const NOW = '2026-01-01T00:00:00.000Z';

describe('CSRF — POST 는 Content-Type: application/json 과 X-Tasky: 1 둘 다 필요', () => {
  it('/api/sync 에 X-Tasky 헤더가 없으면 403', async () => {
    const fx = await createD1Fixture();
    try {
      const req = new Request('https://tasky.example.workers.dev/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const res = await handleRequest(req, envOf(fx), NOW);
      expect(res.status).toBe(403);
    } finally {
      await fx.dispose();
    }
  });

  it('/api/sync 에 Content-Type 이 application/json 이 아니면 403', async () => {
    const fx = await createD1Fixture();
    try {
      const req = new Request('https://tasky.example.workers.dev/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', 'X-Tasky': '1' },
        body: '{}',
      });
      const res = await handleRequest(req, envOf(fx), NOW);
      expect(res.status).toBe(403);
    } finally {
      await fx.dispose();
    }
  });

  it('/auth/logout 에 X-Tasky 헤더가 없으면 403', async () => {
    const fx = await createD1Fixture();
    try {
      const req = new Request('https://tasky.example.workers.dev/auth/logout', { method: 'POST' });
      const res = await handleRequest(req, envOf(fx), NOW);
      expect(res.status).toBe(403);
    } finally {
      await fx.dispose();
    }
  });

  it('두 헤더가 모두 있으면(세션도 유효) 403 이 아니다', async () => {
    const fx = await createD1Fixture();
    try {
      await seedUser(fx, 'csrf-ok', NOW);
      const env = envOf(fx);
      const { signedSid } = await createSession(env, 'csrf-ok', NOW);
      const req = new Request('https://tasky.example.workers.dev/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tasky': '1',
          Cookie: `tasky_session=${encodeURIComponent(signedSid)}`,
        },
        body: JSON.stringify({ protocol: 1, deviceId: 'dev', cursor: 0, changes: [] }),
      });
      const res = await handleRequest(req, env, NOW);
      expect(res.status).not.toBe(403);
      expect(res.status).toBe(200);
    } finally {
      await fx.dispose();
    }
  });
});

describe('본문 크기 상한 — 2 MB 초과는 413', () => {
  it('Content-Length 로 먼저 잘린다(본문을 다 읽지 않고 거절) — 세션이 유효해야 이 분기까지 온다', async () => {
    // 세션 확인이 본문 버퍼링보다 먼저다(§0 상태 블록 4번, 라우터의 순서 수정) — 그래서 이 테스트도
    // 유효한 세션 쿠키를 실어 보낸다. 무쿠키로 보내면 이제 413 이 아니라 401 로 먼저 걸린다(그
    // 회귀는 아래 두 번째 테스트가 지킨다).
    const fx = await createD1Fixture();
    try {
      await seedUser(fx, 'oversize-user', NOW);
      const env = envOf(fx);
      const { signedSid } = await createSession(env, 'oversize-user', NOW);
      const oversized = 'x'.repeat(3 * 1024 * 1024);
      const req = new Request('https://tasky.example.workers.dev/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tasky': '1',
          Cookie: `tasky_session=${encodeURIComponent(signedSid)}`,
        },
        body: oversized,
      });
      const res = await handleRequest(req, env, NOW);
      expect(res.status).toBe(413);
    } finally {
      await fx.dispose();
    }
  });

  it('무쿠키로 2 MB 를 보내면 본문을 버퍼링하기 전에 401 로 먼저 걸린다(§0 상태 블록 4번 회귀 방지)', async () => {
    const fx = await createD1Fixture();
    try {
      const oversized = 'x'.repeat(3 * 1024 * 1024);
      const req = new Request('https://tasky.example.workers.dev/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tasky': '1' },
        body: oversized,
      });
      const res = await handleRequest(req, envOf(fx), NOW);
      expect(res.status).toBe(401);
    } finally {
      await fx.dispose();
    }
  });

  it('/api/account/delete 도 세션 확인이 본문 버퍼링보다 먼저다 — 무쿠키 2 MB 는 401', async () => {
    const fx = await createD1Fixture();
    try {
      const oversized = 'x'.repeat(3 * 1024 * 1024);
      const req = new Request('https://tasky.example.workers.dev/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tasky': '1' },
        body: oversized,
      });
      const res = await handleRequest(req, envOf(fx), NOW);
      expect(res.status).toBe(401);
    } finally {
      await fx.dispose();
    }
  });
});

describe('알 수 없는 경로 — 404', () => {
  it('/api/nope 는 404', async () => {
    const fx = await createD1Fixture();
    try {
      const req = new Request('https://tasky.example.workers.dev/api/nope');
      const res = await handleRequest(req, envOf(fx), NOW);
      expect(res.status).toBe(404);
    } finally {
      await fx.dispose();
    }
  });
});

describe('/api/sync — 두 기기 왕복', () => {
  it('기기 A 가 밀어 넣은 변경을 기기 B 가 다음 풀에서 받는다', async () => {
    const fx = await createD1Fixture();
    try {
      const sub = 'sync-round-trip';
      await seedUser(fx, sub, NOW);
      const env = envOf(fx);
      const { signedSid } = await createSession(env, sub, NOW);
      const cookie = `tasky_session=${encodeURIComponent(signedSid)}`;

      const pushReq = new Request('https://tasky.example.workers.dev/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tasky': '1', Cookie: cookie },
        body: JSON.stringify({
          protocol: 1,
          deviceId: 'device-a',
          cursor: 0,
          changes: [
            {
              tbl: 'categories',
              id: '51c440af-65e9-4604-9d52-1184d35e26d1',
              baseSeq: 0,
              row: {
                id: '51c440af-65e9-4604-9d52-1184d35e26d1',
                name: '공부',
                color: '#FF8FA3',
                order: 0,
                status: 'active',
                createdAt: NOW,
                updatedAt: NOW,
                rev: 1,
              },
            },
          ],
        }),
      });
      const pushRes = await handleRequest(pushReq, env, NOW);
      expect(pushRes.status).toBe(200);
      const pushBody = (await pushRes.json()) as { applied: unknown[]; rejected: unknown[] };
      expect(pushBody.applied, JSON.stringify(pushBody.rejected)).toHaveLength(1);
      expect(pushBody.rejected).toEqual([]);

      const pullReq = new Request('https://tasky.example.workers.dev/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tasky': '1', Cookie: cookie },
        body: JSON.stringify({ protocol: 1, deviceId: 'device-b', cursor: 0, changes: [] }),
      });
      const pullRes = await handleRequest(pullReq, env, NOW);
      const pullBody = (await pullRes.json()) as { pulled: { tbl: string; id: string }[] };
      expect(pullBody.pulled).toHaveLength(1);
      expect(pullBody.pulled[0]).toMatchObject({
        tbl: 'categories',
        id: '51c440af-65e9-4604-9d52-1184d35e26d1',
      });
    } finally {
      await fx.dispose();
    }
  });

  it('미래 시각으로 생성한 로우는 컬럼과 body(풀 응답)가 같은(클램프된) updatedAt 을 갖는다', async () => {
    // 리뷰 라운드 2(백엔드) 재현: `entities.ts#pushOne` 은 저장되는 컬럼(`updated_at`)을
    // 클램프하지만, 예전 `handler.ts` 는 body(JSON)를 클라이언트가 보낸 **원본** 값으로 직렬화해
    // 컬럼과 body 가 서로 다른 updatedAt 을 갖게 됐다 — 풀로 돌아오는 값은 body 쪽이라 클라이언트가
    // 그 어긋남을 그대로 받았다.
    const fx = await createD1Fixture();
    try {
      const sub = 'clamp-body-consistency';
      await seedUser(fx, sub, NOW);
      const env = envOf(fx);
      const { signedSid } = await createSession(env, sub, NOW);
      const cookie = `tasky_session=${encodeURIComponent(signedSid)}`;
      const futureUpdatedAt = '2099-01-01T00:00:00.000Z';
      const id = '7c9f6a2e-2f0e-4a2a-9d4a-6f2a1b3c4d5e';

      const pushReq = new Request('https://tasky.example.workers.dev/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tasky': '1', Cookie: cookie },
        body: JSON.stringify({
          protocol: 1,
          deviceId: 'device-a',
          cursor: 0,
          changes: [
            {
              tbl: 'categories',
              id,
              baseSeq: 0,
              row: {
                id,
                name: '미래',
                color: '#FF8FA3',
                order: 0,
                status: 'active',
                createdAt: NOW,
                updatedAt: futureUpdatedAt,
                rev: 1,
              },
            },
          ],
        }),
      });
      const pushRes = await handleRequest(pushReq, env, NOW);
      expect(pushRes.status).toBe(200);

      // 컬럼 값 — pushOne 이 클램프해 저장한다.
      const column = await fx.db
        .prepare('SELECT updated_at FROM entities WHERE sub = ? AND tbl = ? AND id = ?')
        .bind(sub, 'categories', id)
        .first<{ updated_at: string }>();
      expect(column?.updated_at).toBe(NOW);

      // body(풀 응답) 값 — 다른 기기가 풀로 받는 값도 같은 클램프된 값이어야 한다.
      const pullReq = new Request('https://tasky.example.workers.dev/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tasky': '1', Cookie: cookie },
        body: JSON.stringify({ protocol: 1, deviceId: 'device-b', cursor: 0, changes: [] }),
      });
      const pullRes = await handleRequest(pullReq, env, NOW);
      const pullBody = (await pullRes.json()) as { pulled: { row: { updatedAt: string } }[] };
      expect(pullBody.pulled).toHaveLength(1);
      expect(pullBody.pulled[0]!.row.updatedAt).toBe(NOW);
      expect(pullBody.pulled[0]!.row.updatedAt).toBe(column?.updated_at);
    } finally {
      await fx.dispose();
    }
  });

  it('changes 원소가 null 이어도 500 이 아니라 그 원소만 invalid 로 거절되고 나머지는 처리된다', async () => {
    // 리뷰 라운드 2(백엔드) 재현: `isSyncRequest` 는 `changes` 가 배열인지만 보고 원소 하나하나는
    // 검증하지 않는다 — `null` 원소는 `change.tbl` 접근에서 그대로 던져 요청 전체가 500 이었다.
    const fx = await createD1Fixture();
    try {
      const sub = 'sync-null-change';
      await seedUser(fx, sub, NOW);
      const env = envOf(fx);
      const { signedSid } = await createSession(env, sub, NOW);
      const cookie = `tasky_session=${encodeURIComponent(signedSid)}`;
      const req = new Request('https://tasky.example.workers.dev/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Tasky': '1', Cookie: cookie },
        body: JSON.stringify({
          protocol: 1,
          deviceId: 'device-a',
          cursor: 0,
          changes: [
            null,
            {
              tbl: 'categories',
              id: '2f6e2f2e-27e0-4a37-8f0a-14a0ee9c1f34',
              baseSeq: 0,
              row: {
                id: '2f6e2f2e-27e0-4a37-8f0a-14a0ee9c1f34',
                name: '운동',
                color: '#FF8FA3',
                order: 0,
                status: 'active',
                createdAt: NOW,
                updatedAt: NOW,
                rev: 1,
              },
            },
          ],
        }),
      });
      const res = await handleRequest(req, env, NOW);
      expect(res.status).toBe(200);
      const body = (await res.json()) as {
        applied: unknown[];
        rejected: { reason: string }[];
      };
      expect(body.applied).toHaveLength(1);
      expect(body.rejected).toHaveLength(1);
      expect(body.rejected[0]).toMatchObject({ reason: 'invalid' });
    } finally {
      await fx.dispose();
    }
  });

  it('cursor 가 gcFloor 보다 낮으면 resync 응답', async () => {
    const fx = await createD1Fixture();
    try {
      const sub = 'resync-user';
      await seedUser(fx, sub, NOW);
      await fx.db.prepare('UPDATE users SET gc_floor = ? WHERE sub = ?').bind(100, sub).run();
      const env = envOf(fx);
      const { signedSid } = await createSession(env, sub, NOW);
      const req = new Request('https://tasky.example.workers.dev/api/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Tasky': '1',
          Cookie: `tasky_session=${encodeURIComponent(signedSid)}`,
        },
        body: JSON.stringify({ protocol: 1, deviceId: 'dev', cursor: 5, changes: [] }),
      });
      const res = await handleRequest(req, env, NOW);
      const body = (await res.json()) as { resync?: boolean; gcFloor?: number };
      expect(body).toEqual({ resync: true, gcFloor: 100 });
    } finally {
      await fx.dispose();
    }
  });
});
