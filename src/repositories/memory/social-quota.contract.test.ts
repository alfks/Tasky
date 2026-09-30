import { describe, expect, it } from 'vitest';

import { DEFAULT_ACCENT_COLOR } from '@/domain/theme/palette';

import { createMemorySocialServer } from '@/repositories/memory/social-repository';

const START = Date.UTC(2026, 8, 30, 23, 59, 59, 999);
const INPUT = { text: '완료', happenedOn: '2026-09-30' };

async function fixture() {
  let now = START;
  let sequence = 0;
  const server = createMemorySocialServer({ now: () => now });
  const owner = server.forActor('owner');
  const profile = (await owner.createProfile({ nickname: '주인' })).data;
  return {
    server,
    owner,
    profile,
    key: () => ({ key: `v1.${now}.${(++sequence).toString(16).padStart(32, '0')}` }),
    nextDay: () => {
      now += 1;
    },
  };
}

describe('memory accepted creation quota / R1-08', () => {
  it('20개 성공 후 사본을 모두 삭제해도 일일 quota는 환급하지 않는다', async () => {
    const { owner, server, profile, key } = await fixture();
    for (let index = 0; index < 20; index += 1) {
      const post = (await owner.createPost(INPUT, key())).data;
      await owner.deletePost({ id: post.id }, key());
    }
    expect(server.state.posts.size).toBe(0);
    await expect(owner.createPost(INPUT, key())).rejects.toMatchObject({ code: 'limit-reached' });
    expect(server.state.successfulCreates.get(`${profile.id}:post-create`)?.count).toBe(20);
  });

  it('초대 철회·소비·만료로도 일일 성공 생성량은 환급하지 않는다', async () => {
    const { owner, server, profile, key } = await fixture();
    for (let index = 0; index < 20; index += 1) {
      await owner.createInvite(key());
      const invite = [...server.state.invites.values()].at(-1)!;
      if (index % 3 === 0) await owner.revokeInvite({ inviteId: invite.id }, key());
      else if (index % 3 === 1) invite.status = 'used';
      else invite.expiresAt = START - 1;
    }
    await expect(owner.createInvite(key())).rejects.toMatchObject({ code: 'limit-reached' });
    expect(server.state.successfulCreates.get(`${profile.id}:invite-create`)?.count).toBe(20);
  });

  it('live 초대5 상한 실패와 receipt 재생은 성공 counter를 늘리지 않는다', async () => {
    const { owner, server, profile, key } = await fixture();
    const firstKey = key();
    const first = (await owner.createInvite(firstKey)).data;
    expect('token' in first).toBe(true);
    await owner.createInvite(firstKey);
    for (let index = 0; index < 4; index += 1) await owner.createInvite(key());
    await expect(owner.createInvite(key())).rejects.toMatchObject({ code: 'limit-reached' });
    expect(server.state.successfulCreates.get(`${profile.id}:invite-create`)?.count).toBe(5);
  });

  it('CAS·입력 실패는 quota를 쓰지 않고 성공 key 재생은 삭제 후에도 재생성하지 않는다', async () => {
    const { owner, server, profile, key } = await fixture();
    const category = (
      await owner.saveCategory(
        { name: '공부', color: DEFAULT_ACCENT_COLOR, visibility: 'friends', expectedVersion: 0 },
        key(),
      )
    ).data;
    await expect(
      owner.createPost(
        { ...INPUT, categoryId: category.id, categoryVersion: category.version + 1 },
        key(),
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
    await expect(owner.createPost({ ...INPUT, text: '' }, key())).rejects.toMatchObject({
      code: 'validation',
    });
    expect(server.state.successfulCreates.has(`${profile.id}:post-create`)).toBe(false);
    const originalKey = key();
    const post = (await owner.createPost(INPUT, originalKey)).data;
    await owner.deletePost({ id: post.id }, key());
    expect((await owner.createPost(INPUT, originalKey)).data.id).toBe(post.id);
    expect(server.state.posts.size).toBe(0);
    expect(server.state.successfulCreates.get(`${profile.id}:post-create`)?.count).toBe(1);
  });

  it('UTC rollover 새 key는 허용하고 옛 성공·거절 receipt는 새 날 quota를 바꾸지 않는다', async () => {
    const { owner, server, profile, key, nextDay } = await fixture();
    const firstKey = key();
    const first = (await owner.createPost(INPUT, firstKey)).data;
    for (let index = 0; index < 19; index += 1) await owner.createPost(INPUT, key());
    const rejectedKey = key();
    await expect(owner.createPost(INPUT, rejectedKey)).rejects.toMatchObject({
      code: 'limit-reached',
    });
    nextDay();
    expect((await owner.createPost(INPUT, firstKey)).data.id).toBe(first.id);
    await expect(owner.createPost(INPUT, rejectedKey)).rejects.toMatchObject({
      code: 'limit-reached',
    });
    await owner.createPost(INPUT, key());
    const count = server.state.successfulCreates.get(`${profile.id}:post-create`)!;
    expect(count).toEqual({ windowStart: START + 1, count: 1 });
  });

  it('동시 서로 다른 key의 성공은 20개를 넘지 않는다', async () => {
    const { owner, server, profile, key } = await fixture();
    const outcomes = await Promise.allSettled(
      Array.from({ length: 25 }, () => owner.createPost(INPUT, key())),
    );
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(20);
    expect(server.state.successfulCreates.get(`${profile.id}:post-create`)?.count).toBe(20);
  });

  it('삭제된 actor 접근은 두 bucket을 정리하고 새 incarnation은 독립이다', async () => {
    const { owner, server, profile, key } = await fixture();
    await owner.createPost(INPUT, key());
    await owner.createInvite(key());
    server.state.deleted.add('owner');
    await expect(owner.createPost(INPUT, key())).rejects.toMatchObject({ code: 'account-deleted' });
    expect(server.state.successfulCreates.has(`${profile.id}:post-create`)).toBe(false);
    expect(server.state.successfulCreates.has(`${profile.id}:invite-create`)).toBe(false);
    server.state.deleted.delete('owner');
    server.state.profiles.delete('owner');
    const replacement = (await owner.createProfile({ nickname: '새 주인' })).data;
    expect(replacement.id).not.toBe(profile.id);
    await owner.createPost(INPUT, key());
    expect(server.state.successfulCreates.get(`${replacement.id}:post-create`)?.count).toBe(1);
  });
});
