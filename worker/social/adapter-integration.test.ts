import { describe, expect, it } from 'vitest';

import { createHttpSocialRepository } from '@/infra/social/http-repository';

import { SESSION_COOKIE } from '../auth/cookies';
import { ORIGIN, NOW, key, withServer } from '../test/social-adapter-integration-fixture';

import type { SocialRepository } from '@/repositories/social-repository';
import type { Env } from '../env';
import type { Client, Server } from '../test/social-adapter-integration-fixture';

type Actor = Client & { repo: SocialRepository };
const withRepo = (client: Client): Actor => ({
  ...client,
  repo: createHttpSocialRepository(client.transport),
});

async function issue(client: Actor, n: number): Promise<string> {
  const data = (await client.repo.createInvite({ key: key(n) })).data;
  if (!('token' in data)) throw new Error('새 초대 원문이 반환되지 않았습니다.');
  return data.token;
}

async function pair(env: Env, a: string, b: string) {
  const [lo, hi] = [a, b].sort();
  return env.DB.prepare('SELECT state,version FROM social_pairs WHERE lo=? AND hi=?')
    .bind(lo, hi)
    .first<{ state: string; version: number }>();
}

async function accepted(server: Server, a: Actor, b: Actor, c: Actor) {
  expect((await a.repo.me()).data).toEqual({ profile: null, mode: 'enabled' });
  const aProfile = (await a.repo.createProfile({ nickname: 'A' })).data;
  expect(aProfile.version).toBe(0);
  const renamed = (
    await a.repo.renameProfile({ nickname: 'A2', expectedVersion: 0 }, { key: key(1) })
  ).data;
  expect(renamed).toEqual({ id: aProfile.id, version: 1 });
  const token = await issue(a, 2);
  expect((await c.repo.previewInvite({ token })).data.nickname).toBe('A2');
  const bProfile = (await b.repo.createProfile({ nickname: 'B' })).data;
  const cProfile = (await c.repo.createProfile({ nickname: 'C' })).data;
  expect((await a.repo.invites()).data.items).toContainEqual(
    expect.objectContaining({ status: 'active' }),
  );
  const sent = (await b.repo.sendRequest({ token }, { key: key(3) })).data;
  expect(sent).toEqual({ peerId: aProfile.id, pairVersion: 1 });
  expect((await a.repo.requests('incoming')).data.items[0]).toMatchObject({
    peer: { id: bProfile.id, nickname: 'B' },
    pairVersion: 1,
  });
  expect((await b.repo.requests('outgoing')).data.items[0]?.peer.id).toBe(aProfile.id);
  expect((await c.repo.friends()).data.items).toEqual([]);
  const result = (
    await a.repo.acceptRequest({ peerId: bProfile.id, expectedVersion: 1 }, { key: key(4) })
  ).data;
  expect(result).toEqual({ peerId: bProfile.id, pairVersion: 2, state: 'accepted' });
  expect(await pair(server.env, aProfile.id, bProfile.id)).toEqual({
    state: 'accepted',
    version: 2,
  });
  expect((await a.repo.friends()).data.items[0]).toEqual({
    id: bProfile.id,
    nickname: 'B',
    pairVersion: 2,
  });
  expect((await b.repo.friends()).data.items[0]?.id).toBe(aProfile.id);
  return { aId: aProfile.id, bId: bProfile.id, cId: cProfile.id };
}

async function revoked(
  server: Server,
  a: Actor,
  b: Actor,
  c: Actor,
  ids: {
    aId: string;
    bId: string;
    cId: string;
  },
) {
  const removed = (
    await b.repo.removeFriend({ peerId: ids.aId, expectedVersion: 2 }, { key: key(5) })
  ).data;
  expect(removed).toEqual({ peerId: ids.aId, pairVersion: 3, state: 'none' });
  expect(await pair(server.env, ids.aId, ids.bId)).toEqual({ state: 'none', version: 3 });
  expect((await a.repo.friends()).data.items).toEqual([]);
  const declineToken = await issue(a, 6);
  expect(
    (await c.repo.sendRequest({ token: declineToken }, { key: key(7) })).data.pairVersion,
  ).toBe(1);
  const declined = (
    await a.repo.declineRequest({ peerId: ids.cId, expectedVersion: 1 }, { key: key(8) })
  ).data;
  expect(declined).toMatchObject({ state: 'none', pairVersion: 2 });
  expect(await pair(server.env, ids.aId, ids.cId)).toEqual({ state: 'none', version: 2 });
  const cancelToken = await issue(a, 9);
  const resent = (await c.repo.sendRequest({ token: cancelToken }, { key: key(10) })).data;
  const cancelled = (
    await c.repo.cancelRequest(
      { peerId: ids.aId, expectedVersion: resent.pairVersion },
      { key: key(11) },
    )
  ).data;
  expect(cancelled).toMatchObject({ state: 'none', pairVersion: resent.pairVersion + 1 });
  expect((await a.repo.requests('incoming')).data.items).toEqual([]);
  const revokeToken = await issue(a, 12);
  const active = (await a.repo.invites()).data.items.find((i) => i.status === 'active');
  expect(active?.inviteId).toBeDefined();
  expect(active?.inviteId === revokeToken).toBe(false);
  expect(
    (await a.repo.revokeInvite({ inviteId: active!.inviteId }, { key: key(13) })).data,
  ).toEqual({ revoked: true });
  const invite = await server.env.DB.prepare('SELECT status FROM social_invites WHERE hash=?')
    .bind(active!.inviteId)
    .first<{ status: string }>();
  expect(invite?.status).toBe('revoked');
  const blocked = (await a.repo.setBlock({ peerId: ids.bId, blocked: true }, { key: key(14) }))
    .data;
  expect(blocked).toMatchObject({ blocked: true });
  expect((await a.repo.blocks()).data.items[0]?.id).toBe(ids.bId);
  expect((await b.repo.blocks()).data.items).toEqual([]);
  expect(await pair(server.env, ids.aId, ids.bId)).toEqual({
    state: 'none',
    version: blocked.pairVersion,
  });
  const block = await server.env.DB.prepare(
    'SELECT COUNT(*) AS n FROM social_blocks WHERE blocker=? AND blocked=?',
  )
    .bind(ids.aId, ids.bId)
    .first<{ n: number }>();
  expect(block?.n).toBe(1);
}

describe('social adapter to real Worker and Miniflare D1', () => {
  it('connects the initial 16 routes and persists relation, invite, and block effects', async () => {
    await withServer(async (server) => {
      const [a, b, c] = (await Promise.all(['a', 'b', 'c'].map(server.actor))).map(withRepo);
      const ids = await accepted(server, a, b, c);
      await revoked(server, a, b, c, ids);
      const seen = [a, b, c].flatMap((actor) => actor.seen);
      expect(
        seen.every(
          (call) =>
            call.credentials === 'include' &&
            call.cache === 'no-store' &&
            call.headers.get('X-Tasky') === '1' &&
            call.bodyPreserved &&
            call.cacheControl === 'private, no-store' &&
            call.vary === 'Cookie' &&
            call.envelopeOk &&
            (call.method !== 'POST' || call.headers.get('Content-Type') === 'application/json'),
        ),
      ).toBe(true);
      expect(
        new Set(seen.map((call) => `${call.method} ${new URL(call.path, ORIGIN).pathname}`)),
      ).toEqual(
        new Set([
          'GET /api/social/me',
          'POST /api/social/profile',
          'POST /api/social/profile/name',
          'GET /api/social/friends',
          'GET /api/social/requests',
          'POST /api/social/invites',
          'GET /api/social/invites',
          'POST /api/social/invites/revoke',
          'POST /api/social/invites/preview',
          'POST /api/social/requests',
          'POST /api/social/requests/accept',
          'POST /api/social/requests/decline',
          'POST /api/social/requests/cancel',
          'POST /api/social/friends/remove',
          'GET /api/social/blocks',
          'POST /api/social/blocks/set',
        ]),
      );
    });
  }, 30_000);

  it('keeps actor cookie jars separate and applies Origin, mode, refresh, and deletion', async () => {
    await withServer(async ({ env, actor, clock }) => {
      const [a, b, c] = (await Promise.all(['a', 'b', 'c'].map(actor))).map(withRepo);
      await a.repo.createProfile({ nickname: 'A' });
      const token = await issue(a, 20);
      b.jar.clear();
      await expect(b.repo.me()).rejects.toMatchObject({ code: 'unauthorized' });
      expect(b.seen.at(-1)?.status).toBe(401);
      c.origin.value = 'https://other.example';
      await expect(c.repo.createProfile({ nickname: 'C' })).rejects.toMatchObject({ code: 'csrf' });
      expect(c.seen.at(-1)?.status).toBe(403);
      c.origin.value = ORIGIN;
      const cCookie = c.jar.get(SESSION_COOKIE);
      env.SOCIAL_MODE = 'read-only';
      expect((await c.repo.previewInvite({ token })).data.nickname).toBe('A');
      await expect(a.repo.createInvite({ key: key(21) })).rejects.toMatchObject({
        code: 'social-disabled',
        retryAfter: 60,
      });
      env.SOCIAL_MODE = 'off';
      expect((await a.repo.me()).data.mode).toBe('off');
      await expect(c.repo.previewInvite({ token })).rejects.toMatchObject({
        code: 'social-disabled',
      });
      clock.value = new Date(Date.parse(NOW) + 24 * 86_400_000).toISOString();
      await a.repo.me();
      expect(a.seen.at(-1)?.cookieAction).toBe('set');
      await env.DB.prepare('INSERT INTO deleted_users(sub,deleted_at) VALUES(?,?)')
        .bind('a', clock.value)
        .run();
      await expect(a.repo.me()).rejects.toMatchObject({ code: 'account-deleted' });
      expect(a.seen.at(-1)?.cookieAction).toBe('clear');
      expect(a.jar.has(SESSION_COOKIE)).toBe(false);
      expect(c.jar.get(SESSION_COOKIE)).toBe(cCookie);
      expect(b.jar.has(SESSION_COOKIE)).toBe(false);
      await expect(a.repo.me()).rejects.toMatchObject({ code: 'unauthorized' });
      expect((await c.repo.me()).data.mode).toBe('off');
    });
  }, 30_000);

  it('replays a matching key, rejects changed hash and stale CAS, and decodes real 429', async () => {
    await withServer(async ({ env, actor }) => {
      const a = withRepo(await actor('a'));
      const profile = (await a.repo.createProfile({ nickname: 'A' })).data;
      const input = { nickname: 'A2', expectedVersion: 0 };
      const first = (await a.repo.renameProfile(input, { key: key(30) })).data;
      expect((await a.repo.renameProfile(input, { key: key(30) })).data).toEqual(first);
      await expect(
        a.repo.renameProfile({ ...input, nickname: 'A3' }, { key: key(30) }),
      ).rejects.toMatchObject({ code: 'idempotency-conflict' });
      await expect(a.repo.renameProfile(input, { key: key(31) })).rejects.toMatchObject({
        code: 'conflict',
      });
      const row = await env.DB.prepare('SELECT nickname,version FROM social_profiles WHERE id=?')
        .bind(profile.id)
        .first<{ nickname: string; version: number }>();
      expect(row).toEqual({ nickname: 'A2', version: 1 });
      await a.repo.me();
      await env.DB.prepare("UPDATE social_limits SET count=120 WHERE bucket='read'").run();
      await expect(a.repo.me()).rejects.toMatchObject({
        code: 'rate-limited',
        serverTime: Date.parse(NOW),
        retryAfter: 60,
      });
      expect(a.seen.at(-1)).toMatchObject({ status: 429, retryAfter: '60', envelopeOk: true });
      expect(
        (
          await env.DB.prepare("SELECT count FROM social_limits WHERE bucket='read'").first<{
            count: number;
          }>()
        )?.count,
      ).toBe(120);
    });
  }, 30_000);
});
