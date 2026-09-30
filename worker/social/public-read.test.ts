import { describe, expect, it } from 'vitest';

import { handleRequest } from '../router';
import {
  withServer,
  NOW,
  ORIGIN,
  key,
  type Client,
  type Server,
} from '../test/social-adapter-integration-fixture';
function cookie(client: Client): string {
  return [...client.jar].map(([name, value]) => `${name}=${value}`).join('; ');
}
function request(path: string, auth = '', body?: unknown, operation = 1) {
  return new Request(`${ORIGIN}/api/social${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(auth ? { Cookie: auth } : {}),
      ...(body === undefined
        ? {}
        : {
            Origin: ORIGIN,
            'X-Tasky': '1',
            'Content-Type': 'application/json',
            'Idempotency-Key': key(operation),
          }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}
async function publicFixture(server: Server) {
  const author = await server.actor('a');
  const auth = cookie(author);
  const bootstrap = request('/profile', auth, { nickname: '공개 별명' });
  const profile = await handleRequest(bootstrap, server.env, NOW);
  expect(profile.status).toBe(201);
  const category = await handleRequest(
    request(
      '/categories',
      auth,
      { expectedVersion: 0, name: '공부', color: '#7CC6FF', visibility: 'public' },
      1,
    ),
    server.env,
    NOW,
  );
  expect(category.status).toBe(200);
  const categoryData = ((await category.json()) as { data: { id: string; version: number } }).data;
  const posted = await handleRequest(
    request(
      '/posts',
      auth,
      {
        text: '직접 확인한 공개 문장',
        happenedOn: '2026-09-28',
        categoryId: categoryData.id,
        categoryVersion: categoryData.version,
      },
      2,
    ),
    server.env,
    NOW,
  );
  expect(posted.status).toBe(201);
  const postId = ((await posted.json()) as { data: { id: string } }).data.id;
  return { auth, category: categoryData, postId };
}
async function count(
  server: Server,
  table: 'social_profiles' | 'social_commands' | 'social_posts',
) {
  return (await server.env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).first<{ n: number }>())
    ?.n;
}
function noStore(response: Response) {
  expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  expect(response.headers.get('Vary')).toBe('Cookie');
}
async function expectHidden(server: Server, path: string, auth: string, status: number) {
  const response = await handleRequest(request(path, auth), server.env, NOW);
  expect(response.status, path).toBe(status);
  noStore(response);
  const body = await response.text();
  expect(body).not.toContain('직접 확인한 공개 문장');
  expect(body).not.toContain('공개 별명');
  return response;
}
describe('공개 HTTP의 인증·모드 경계', () => {
  it('익명과 프로필 없는 인증 사용자는 공개 자료만 읽고 개인 식별자 없이 no-store 응답을 받는다', async () => {
    await withServer(async (server) => {
      const publication = await publicFixture(server);
      const profileless = cookie(await server.actor('b'));
      for (const auth of ['', profileless]) {
        for (const path of [
          '/public/feed',
          '/public/categories',
          `/public/posts/${publication.postId}`,
          `/public/posts/validate?ids=${publication.postId}`,
        ]) {
          const response = await handleRequest(request(path, auth), server.env, NOW);
          expect(response.status, path).toBe(200);
          noStore(response);
          const body = await response.text();
          expect(body).not.toContain('@example.test');
          for (const ownerField of ['postCount', 'revoked']) expect(body).not.toContain(ownerField);
          expect(body).not.toContain('tasky_session');
          expect(body).not.toContain('socialCategoryId');
        }
      }
      const me = await handleRequest(request('/me', profileless), server.env, NOW);
      expect(await me.json()).toMatchObject({ data: { profile: null } });
      expect(await count(server, 'social_profiles')).toBe(1);
      expect(await count(server, 'social_commands')).toBe(2);
    });
  }, 15_000);
  it('제시된 잘못된·만료된 쿠키와 삭제 계정은 401/410이고 익명으로 낮춰 읽지 않는다', async () => {
    await withServer(async (server) => {
      const publication = await publicFixture(server);
      const expired = cookie(await server.actor('b'));
      const deleted = cookie(await server.actor('c'));
      await server.env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE sub = ?')
        .bind(NOW, 'b')
        .run();
      await server.env.DB.prepare('INSERT INTO deleted_users(sub,deleted_at) VALUES(?,?)')
        .bind('c', NOW)
        .run();
      for (const [auth, status] of [
        ['tasky_session=forged', 401],
        ['tasky_session=', 401],
        [expired, 401],
        [deleted, 410],
      ] as const) {
        let expectedStatus: number = status;
        for (const path of [
          '/public/feed',
          '/public/categories',
          `/public/posts/${publication.postId}`,
          `/public/posts/validate?ids=${publication.postId}`,
        ]) {
          const response = await expectHidden(server, path, auth, expectedStatus);
          expectedStatus = status === 410 ? 401 : status;
          if (response.status === 410)
            expect(response.headers.get('Set-Cookie')).toContain('Max-Age=0');
        }
      }
      const anonymous = await handleRequest(
        request(`/public/posts/${publication.postId}`),
        server.env,
        NOW,
      );
      expect(anonymous.status).toBe(200);
    });
  }, 15_000);
  it('off·잘못된 allowlist는 공개를 가리고 read-only는 읽기만 유지한다', async () => {
    await withServer(async (server) => {
      const publication = await publicFixture(server);
      const outsider = cookie(await server.actor('outside'));
      await expectHidden(server, '/public/feed', outsider, 503);
      await server.actor('b');
      await server.env.DB.batch([
        server.env.DB.prepare(
          'INSERT INTO social_profiles(id,sub,nickname,version,created_at) VALUES(?,?,?,0,?)',
        ).bind('d'.repeat(32), 'b', '다른 작성자', Date.parse(NOW)),
        server.env.DB.prepare(
          'INSERT INTO social_categories(id,owner,name,color,visibility,version,updated_at) VALUES(?,?,?,?,?,1,?)',
        ).bind('f'.repeat(32), 'd'.repeat(32), '공개 자료', '#7CC6FF', 'public', Date.parse(NOW)),
        server.env.DB.prepare(
          'INSERT INTO social_posts(id,author,text,happened_on,created_at,category_id) VALUES(?,?,?,?,?,?)',
        ).bind(
          'e'.repeat(32),
          'd'.repeat(32),
          '타인의 사본',
          '2026-09-28',
          Date.parse(NOW),
          'f'.repeat(32),
        ),
      ]);
      server.env.SOCIAL_MODE = 'read-only';
      expect((await handleRequest(request('/public/feed'), server.env, NOW)).status).toBe(200);
      expect(
        (
          await handleRequest(
            request(
              '/posts',
              publication.auth,
              {
                text: '추가 공개',
                happenedOn: '2026-09-28',
                categoryId: publication.category.id,
                categoryVersion: 1,
              },
              3,
            ),
            server.env,
            NOW,
          )
        ).status,
      ).toBe(503);
      for (const allowlist of ['not-json', '[]', '["*"]', '["person@example.test"]']) {
        server.env.SOCIAL_ALLOWLIST = allowlist;
        await expectHidden(server, '/public/feed', '', 503);
      }
      server.env.SOCIAL_ALLOWLIST = '["b","c"]';
      const filtered = await handleRequest(request('/public/feed'), server.env, NOW);
      expect(await filtered.json()).toMatchObject({ data: { items: [{ id: 'e'.repeat(32) }] } });
      await expectHidden(server, `/public/posts/${publication.postId}`, '', 404);
      server.env.SOCIAL_ALLOWLIST = '["a","b","c"]';
      server.env.SOCIAL_MODE = 'off';
      await expectHidden(server, '/public/feed', '', 503);
      expect(
        (await handleRequest(request('/posts/mine', publication.auth), server.env, NOW)).status,
      ).toBe(200);
      const ownedValidation = await handleRequest(
        request(
          '/posts/validate',
          publication.auth,
          { ids: [publication.postId, 'e'.repeat(32)] },
          4,
        ),
        server.env,
        NOW,
      );
      expect(ownedValidation.status).toBe(200);
      expect(await ownedValidation.json()).toMatchObject({
        data: { allowedIds: [publication.postId] },
      });
      const revoked = await handleRequest(
        request(
          '/categories/revoke',
          publication.auth,
          { id: publication.category.id, expectedVersion: 1 },
          5,
        ),
        server.env,
        NOW,
      );
      expect(revoked.status).toBe(200);
      expect(await revoked.json()).toMatchObject({
        data: { visibility: 'private', revoked: true },
      });
    });
  }, 15_000);
  it('익명 쓰기·GET 부작용·원본 필드 전송을 거절하고 오류도 캐시하지 않는다', async () => {
    await withServer(async (server) => {
      const publication = await publicFixture(server);
      for (const path of ['/posts', '/categories', '/reactions/set', '/categories/revoke']) {
        const response = await handleRequest(
          request(path, '', { postId: publication.postId, active: true }),
          server.env,
          NOW,
        );
        expect(response.status).toBe(401);
        noStore(response);
      }
      const publicWrite = await handleRequest(
        request('/public/feed', '', { text: '게시 시도' }),
        server.env,
        NOW,
      );
      expect(publicWrite.status).toBe(404);
      noStore(publicWrite);
      for (const extra of [
        { sourceId: 'private-original' },
        { memo: '개인 메모' },
        { owner: 'a' },
      ]) {
        const response = await handleRequest(
          request(
            '/posts',
            publication.auth,
            {
              text: '공개',
              happenedOn: '2026-09-28',
              categoryId: publication.category.id,
              categoryVersion: 1,
              ...extra,
            },
            10,
          ),
          server.env,
          NOW,
        );
        expect(response.status).toBe(422);
        noStore(response);
      }
      const invalid = await handleRequest(
        request(
          '/public/posts/validate?ids=' +
            Array.from({ length: 51 }, (_, i) => i.toString(16).padStart(32, '0')).join(','),
        ),
        server.env,
        NOW,
      );
      expect(invalid.status).toBe(400);
      noStore(invalid);
      expect(await count(server, 'social_posts')).toBe(1);
    });
  }, 15_000);
});
