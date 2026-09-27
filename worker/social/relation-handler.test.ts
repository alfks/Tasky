import { describe, expect, it } from 'vitest';

import { createSession } from '../auth/session';
import { handleRequest } from '../router';
import { createD1Fixture } from '../test/d1-harness';

import type { Env } from '../env';

const NOW = '2026-01-01T00:00:00.000Z';
const ORIGIN = 'https://tasky.example.workers.dev';
const KEY = (n: number) => `v1.${Date.parse(NOW)}.${n.toString(16).padStart(32, '0')}`;

function testEnv(db: D1Database): Env {
  return {
    DB: db,
    ASSETS: {} as Fetcher,
    GOOGLE_CLIENT_ID: 'x',
    GOOGLE_CLIENT_SECRET: 'x',
    SESSION_SECRET: 'secret',
    SOCIAL_MODE: 'enabled',
    SOCIAL_ALLOWLIST: '["a","b","c"]',
  };
}

async function user(env: Env, sub: string): Promise<string> {
  await env.DB.prepare('INSERT INTO users(sub,email,created_at) VALUES(?,?,?)')
    .bind(sub, `${sub}@x.test`, NOW)
    .run();
  const { signedSid } = await createSession(env, sub, NOW);
  return `tasky_session=${encodeURIComponent(signedSid)}`;
}

function request(path: string, cookie: string, body?: unknown, key?: string): Request {
  return new Request(`${ORIGIN}/api/social${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      Cookie: cookie,
      ...(body === undefined
        ? {}
        : { Origin: ORIGIN, 'X-Tasky': '1', 'Content-Type': 'application/json' }),
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

describe('social relationship HTTP and D1', () => {
  it('초대·요청·수락·차단·해제를 HTTP와 D1에서 왕복한다', async () => {
    const fx = await createD1Fixture();
    try {
      const env = testEnv(fx.db);
      const a = await user(env, 'a');
      const b = await user(env, 'b');
      const profileA = (await (
        await handleRequest(request('/profile', a, { nickname: 'A' }), env, NOW)
      ).json()) as { data: { id: string } };
      await handleRequest(request('/profile', b, { nickname: 'B' }), env, NOW);
      const invite = await handleRequest(request('/invites', a, {}, KEY(1)), env, NOW);
      expect(invite.status).toBe(201);
      const inviteData = (await invite.json()) as { data: { token: string } };
      const preview = await handleRequest(
        request('/invites/preview', b, { token: inviteData.data.token }),
        env,
        NOW,
      );
      expect(preview.status).toBe(200);
      const sent = await handleRequest(
        request('/requests', b, { token: inviteData.data.token }, KEY(2)),
        env,
        NOW,
      );
      expect(sent.status).toBe(201);
      const sentData = (await sent.json()) as { data: { pairVersion: number } };
      const incoming = await handleRequest(request('/requests?direction=incoming', a), env, NOW);
      expect((await incoming.json()) as object).toMatchObject({
        data: { items: [{ peer: { nickname: 'B' }, pairVersion: sentData.data.pairVersion }] },
      });
      const accepted = await handleRequest(
        request(
          '/requests/accept',
          a,
          {
            peerId: (
              (await (await handleRequest(request('/me', b), env, NOW)).json()) as {
                data: { profile: { id: string } };
              }
            ).data.profile.id,
            expectedVersion: sentData.data.pairVersion,
          },
          KEY(3),
        ),
        env,
        NOW,
      );
      expect(accepted.status).toBe(200);
      const friends = await handleRequest(request('/friends', b), env, NOW);
      expect(await friends.json()).toMatchObject({
        data: { items: [{ id: profileA.data.id, nickname: 'A' }] },
      });
      const blocked = await handleRequest(
        request(
          '/blocks/set',
          a,
          {
            peerId: (
              (await (await handleRequest(request('/me', b), env, NOW)).json()) as {
                data: { profile: { id: string } };
              }
            ).data.profile.id,
            blocked: true,
          },
          KEY(4),
        ),
        env,
        NOW,
      );
      expect(blocked.status).toBe(200);
      expect(await (await handleRequest(request('/friends', b), env, NOW)).json()).toMatchObject({
        data: { items: [] },
      });
      const blockedData = (await blocked.json()) as { data: { pairVersion: number } };
      const unblocked = await handleRequest(
        request(
          '/blocks/set',
          a,
          {
            peerId: (
              (await (await handleRequest(request('/me', b), env, NOW)).json()) as {
                data: { profile: { id: string } };
              }
            ).data.profile.id,
            blocked: false,
            expectedVersion: blockedData.data.pairVersion,
          },
          KEY(5),
        ),
        env,
        NOW,
      );
      expect(unblocked.status).toBe(200);
    } finally {
      await fx.dispose();
    }
  }, 15_000);

  it('요청 취소·거절과 초대 철회를 nonce receipt로 처리한다', async () => {
    const fx = await createD1Fixture();
    try {
      const env = testEnv(fx.db);
      const a = await user(env, 'a');
      const b = await user(env, 'b');
      const c = await user(env, 'c');
      const ids: Record<string, string> = {};
      for (const [name, cookie] of [
        ['a', a],
        ['b', b],
        ['c', c],
      ]) {
        const response = await handleRequest(
          request('/profile', cookie, { nickname: name }),
          env,
          NOW,
        );
        ids[name] = ((await response.json()) as { data: { id: string } }).data.id;
      }
      const first = (await (
        await handleRequest(request('/invites', a, {}, KEY(10)), env, NOW)
      ).json()) as { data: { token: string } };
      const sent = (await (
        await handleRequest(request('/requests', b, { token: first.data.token }, KEY(11)), env, NOW)
      ).json()) as { data: { pairVersion: number } };
      const cancel = await handleRequest(
        request(
          '/requests/cancel',
          b,
          { peerId: ids.a, expectedVersion: sent.data.pairVersion },
          KEY(12),
        ),
        env,
        NOW,
      );
      expect(cancel.status).toBe(200);
      expect(await cancel.json()).toMatchObject({ data: { state: 'none' } });
      const replay = await handleRequest(
        request(
          '/requests/cancel',
          b,
          { peerId: ids.a, expectedVersion: sent.data.pairVersion },
          KEY(12),
        ),
        env,
        NOW,
      );
      expect(replay.status).toBe(200);
      const second = (await (
        await handleRequest(request('/invites', a, {}, KEY(13)), env, NOW)
      ).json()) as { data: { token: string } };
      const sentAgain = (await (
        await handleRequest(
          request('/requests', b, { token: second.data.token }, KEY(14)),
          env,
          NOW,
        )
      ).json()) as { data: { pairVersion: number } };
      const decline = await handleRequest(
        request(
          '/requests/decline',
          a,
          { peerId: ids.b, expectedVersion: sentAgain.data.pairVersion },
          KEY(15),
        ),
        env,
        NOW,
      );
      expect(decline.status).toBe(200);
      const third = (await (
        await handleRequest(request('/invites', a, {}, KEY(16)), env, NOW)
      ).json()) as { data: { token: string } };
      const listing = (await (await handleRequest(request('/invites', a), env, NOW)).json()) as {
        data: { items: { inviteId: string; status: string }[] };
      };
      const active = listing.data.items.find((item) => item.status === 'active');
      expect(active).toBeDefined();
      const revoke = await handleRequest(
        request('/invites/revoke', a, { inviteId: active!.inviteId }, KEY(17)),
        env,
        NOW,
      );
      expect(revoke.status).toBe(200);
      expect(await revoke.json()).toMatchObject({ data: { revoked: true } });
      expect(
        (await handleRequest(request('/invites/preview', c, { token: third.data.token }), env, NOW))
          .status,
      ).toBe(404);
      expect(
        (
          await handleRequest(
            request('/invites/revoke', c, { inviteId: active!.inviteId }, KEY(18)),
            env,
            NOW,
          )
        ).status,
      ).toBe(404);
    } finally {
      await fx.dispose();
    }
  }, 15_000);
});
