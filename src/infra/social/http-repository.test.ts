import { describe, expect, it, vi } from 'vitest';

import type { SocialRepository } from '@/repositories/social-repository';

import { createHttpSocialRepository } from '@/infra/social/http-repository';

const ID_A = '0000000000000000000000000000000a';
const ID_B = '0000000000000000000000000000000b';
const TOKEN = 'a'.repeat(64);
const KEY = 'v1.1800000000000.00000000000000000000000000000001';
const NOW = 1_800_000_000_000;

function result(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ data, serverTime: NOW }), { status });
}

type RouteCase = {
  name: string;
  method: 'GET' | 'POST';
  path: string;
  data: unknown;
  body?: unknown;
  key?: string;
  call: (repo: SocialRepository) => Promise<unknown>;
};

const EMPTY = { items: [], nextCursor: null };
const PAIR = { peerId: ID_B, pairVersion: 2, state: 'accepted' };
const ROUTES: readonly RouteCase[] = [
  {
    name: 'me',
    method: 'GET',
    path: '/me',
    data: { profile: null, mode: 'off' },
    call: (r) => r.me(),
  },
  {
    name: 'createProfile',
    method: 'POST',
    path: '/profile',
    body: { nickname: '가' },
    data: { id: ID_A, nickname: '가', version: 1 },
    call: (r) => r.createProfile({ nickname: '가' }),
  },
  {
    name: 'renameProfile',
    method: 'POST',
    path: '/profile/name',
    body: { nickname: '나', expectedVersion: 1 },
    key: KEY,
    data: { id: ID_A, version: 2 },
    call: (r) => r.renameProfile({ nickname: '나', expectedVersion: 1 }, { key: KEY }),
  },
  {
    name: 'friends',
    method: 'GET',
    path: '/friends?cursor=next&limit=3',
    data: EMPTY,
    call: (r) => r.friends({ cursor: 'next', limit: 3 }),
  },
  {
    name: 'requests',
    method: 'GET',
    path: '/requests?direction=incoming',
    data: EMPTY,
    call: (r) => r.requests('incoming'),
  },
  {
    name: 'createInvite',
    method: 'POST',
    path: '/invites',
    body: {},
    key: KEY,
    data: { token: TOKEN, expiresAt: NOW + 1000 },
    call: (r) => r.createInvite({ key: KEY }),
  },
  { name: 'invites', method: 'GET', path: '/invites', data: EMPTY, call: (r) => r.invites() },
  {
    name: 'revokeInvite',
    method: 'POST',
    path: '/invites/revoke',
    body: { inviteId: TOKEN },
    key: KEY,
    data: { revoked: true },
    call: (r) => r.revokeInvite({ inviteId: TOKEN }, { key: KEY }),
  },
  {
    name: 'previewInvite',
    method: 'POST',
    path: '/invites/preview',
    body: { token: TOKEN },
    data: { nickname: '가', expiresAt: NOW + 1000 },
    call: (r) => r.previewInvite({ token: TOKEN }),
  },
  {
    name: 'sendRequest',
    method: 'POST',
    path: '/requests',
    body: { token: TOKEN },
    key: KEY,
    data: { peerId: ID_B, pairVersion: 1 },
    call: (r) => r.sendRequest({ token: TOKEN }, { key: KEY }),
  },
  ...(['accept', 'decline', 'cancel'] as const).map((action): RouteCase => ({
    name: `${action}Request`,
    method: 'POST',
    path: `/requests/${action}`,
    body: { peerId: ID_B, expectedVersion: 1 },
    key: KEY,
    data: PAIR,
    call: (r) => r[`${action}Request`]({ peerId: ID_B, expectedVersion: 1 }, { key: KEY }),
  })),
  {
    name: 'removeFriend',
    method: 'POST',
    path: '/friends/remove',
    body: { peerId: ID_B, expectedVersion: 1 },
    key: KEY,
    data: PAIR,
    call: (r) => r.removeFriend({ peerId: ID_B, expectedVersion: 1 }, { key: KEY }),
  },
  { name: 'blocks', method: 'GET', path: '/blocks', data: EMPTY, call: (r) => r.blocks() },
  {
    name: 'setBlock',
    method: 'POST',
    path: '/blocks/set',
    body: { peerId: ID_B, blocked: true },
    key: KEY,
    data: { blocked: true, pairVersion: 2 },
    call: (r) => r.setBlock({ peerId: ID_B, blocked: true }, { key: KEY }),
  },
  { name: 'feed', method: 'GET', path: '/feed', data: EMPTY, call: (r) => r.feed() },
  {
    name: 'validatePosts',
    method: 'POST',
    path: '/posts/validate',
    body: { ids: [ID_A] },
    data: { allowedIds: [ID_A] },
    call: (r) => r.validatePosts({ ids: [ID_A] }),
  },
  { name: 'myPosts', method: 'GET', path: '/posts/mine', data: EMPTY, call: (r) => r.myPosts() },
  {
    name: 'createPost',
    method: 'POST',
    path: '/posts',
    body: { text: '완료', happenedOn: '2026-09-28' },
    key: KEY,
    data: { id: ID_A },
    call: (r) => r.createPost({ text: '완료', happenedOn: '2026-09-28' }, { key: KEY }),
  },
  {
    name: 'deletePost',
    method: 'POST',
    path: '/posts/delete',
    body: { id: ID_A },
    key: KEY,
    data: { deleted: true },
    call: (r) => r.deletePost({ id: ID_A }, { key: KEY }),
  },
  {
    name: 'setReaction',
    method: 'POST',
    path: '/reactions/set',
    body: { postId: ID_A, active: true },
    key: KEY,
    data: { postId: ID_A, active: true },
    call: (r) => r.setReaction({ postId: ID_A, active: true }, { key: KEY }),
  },
];

describe('소셜 HTTP 저장소', () => {
  it.each(ROUTES)('$name 공개 경로와 body·key만 전송한다', async (route) => {
    const transport = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      result(route.data),
    );
    await route.call(createHttpSocialRepository(transport));
    expect(transport).toHaveBeenCalledTimes(1);
    const [path, options] = transport.mock.calls[0];
    expect(path).toBe(`/api/social${route.path}`);
    expect(options).toMatchObject({
      method: route.method,
      credentials: 'include',
      cache: 'no-store',
      headers: expect.objectContaining({ 'X-Tasky': '1' }),
    });
    const headers = options?.headers as Record<string, string>;
    expect(headers['Idempotency-Key']).toBe(route.key);
    if (route.method === 'POST') {
      expect(headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(String(options?.body))).toEqual(route.body);
    } else {
      expect(options?.body).toBeUndefined();
    }
    expect(String(path)).not.toContain(TOKEN);
  });

  it('서버 오류 envelope의 코드·시각·재시도 간격을 보존한다', async () => {
    const transport = vi.fn(
      async () =>
        new Response(JSON.stringify({ error: { code: 'rate-limited' }, serverTime: NOW }), {
          status: 429,
          headers: { 'Retry-After': '12' },
        }),
    );
    await expect(createHttpSocialRepository(transport).me()).rejects.toMatchObject({
      code: 'rate-limited',
      serverTime: NOW,
      retryAfter: 12,
    });
  });

  it.each([401, 410])('%i 상태는 비JSON·불일치 body보다 인증 철회를 우선한다', async (status) => {
    const expected = status === 401 ? 'unauthorized' : 'account-deleted';
    const nonJson = new Response('broken', { status });
    await expect(createHttpSocialRepository(async () => nonJson).feed()).rejects.toMatchObject({
      code: expected,
    });
    const mismatch = new Response(
      JSON.stringify({
        error: { code: 'rate-limited' },
        serverTime: NOW,
      }),
      { status },
    );
    await expect(createHttpSocialRepository(async () => mismatch).feed()).rejects.toMatchObject({
      code: expected,
      serverTime: NOW,
    });
  });

  it('비인증 상태와 불일치하는 오류 코드를 신뢰하지 않는다', async () => {
    const mismatch = new Response(
      JSON.stringify({
        error: { code: 'unauthorized' },
        serverTime: NOW,
      }),
      { status: 503 },
    );
    await expect(createHttpSocialRepository(async () => mismatch).feed()).rejects.toMatchObject({
      code: 'temporary',
    });
  });

  it('응답 불명·네트워크 실패는 성공이나 자동 재시도로 바꾸지 않는다', async () => {
    const transport = vi.fn(async () => {
      throw new TypeError('offline');
    });
    const repo = createHttpSocialRepository(transport);
    await expect(repo.createInvite({ key: KEY })).rejects.toMatchObject({ code: 'temporary' });
    expect(transport).toHaveBeenCalledTimes(1);
  });

  it('공개 DTO·envelope의 초과 필드를 거절한다', async () => {
    const response = result({ profile: null, mode: 'enabled', email: 'private@example.com' });
    await expect(createHttpSocialRepository(async () => response).me()).rejects.toMatchObject({
      code: 'temporary',
    });
    const extra = new Response(JSON.stringify({ data: EMPTY, serverTime: NOW, sub: 'private' }));
    await expect(createHttpSocialRepository(async () => extra).feed()).rejects.toMatchObject({
      code: 'temporary',
    });
  });

  it('원문 토큰 형식과 페이지 50개 상한을 응답에서도 검증한다', async () => {
    const badInvite = result({ token: 'short', expiresAt: NOW + 1000 });
    await expect(
      createHttpSocialRepository(async () => badInvite).createInvite({ key: KEY }),
    ).rejects.toMatchObject({ code: 'temporary' });
    const tooMany = result({
      items: Array.from({ length: 51 }, () => ({
        id: ID_A,
        author: { id: ID_B, nickname: '나' },
        text: 'x',
        happenedOn: '2026-09-28',
        createdAt: NOW,
        reactionCount: 0,
        myReaction: false,
      })),
      nextCursor: null,
    });
    await expect(createHttpSocialRepository(async () => tooMany).feed()).rejects.toMatchObject({
      code: 'temporary',
    });
  });
});
