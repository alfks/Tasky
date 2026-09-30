import { describe, expect, it } from 'vitest';

import { VISIBILITY_READ_VECTORS } from '@/domain/social/visibility-vectors';
import { DEFAULT_ACCENT_COLOR } from '@/domain/theme/palette';

import { pairKey } from '@/repositories/memory/social/relations';
import { createMemorySocialServer } from '@/repositories/memory/social-repository';

const NOW = 1800000000000;
function commandKey(sequence: number) {
  return { key: `v1.${NOW}.${sequence.toString(16).padStart(32, '0')}` };
}
const INPUT = {
  name: '공부',
  color: DEFAULT_ACCENT_COLOR,
  visibility: 'public' as const,
  expectedVersion: 0,
};

async function setup() {
  const server = createMemorySocialServer({ now: () => NOW });
  const owner = server.forActor('owner');
  const peer = server.forActor('peer');
  const a = (await owner.createProfile({ nickname: '가' })).data;
  const b = (await peer.createProfile({ nickname: '나' })).data;
  return { server, owner, peer, a, b };
}

describe('공통 공개범위 벡터(memory 포트)', () => {
  for (const vector of VISIBILITY_READ_VECTORS) {
    it(`R4/R12/R13 ${vector.name}`, async () => {
      const { server, owner, peer, a, b } = await setup();
      const category = (
        await owner.saveCategory({ ...INPUT, visibility: vector.facts.visibility }, commandKey(1))
      ).data;
      const post = (
        await owner.createPost(
          {
            text: '완료',
            happenedOn: '2026-09-30',
            categoryId: category.id,
            categoryVersion: category.version,
          },
          commandKey(2),
        )
      ).data;
      if (vector.facts.friends)
        server.state.pairs.set(pairKey(a.id, b.id), {
          lo: a.id,
          hi: b.id,
          state: 'accepted',
          requesterId: null,
          requestedAt: null,
          version: 1,
        });
      if (vector.facts.blocked) server.state.blocks.add(`${a.id}:${b.id}`);
      const ids =
        vector.facts.viewerId === null
          ? (await server.publicForActor().validatePosts({ ids: [post.id] })).data.allowedIds
          : (
              await (vector.facts.viewerId === vector.facts.ownerId ? owner : peer).validatePosts({
                ids: [post.id],
              })
            ).data.allowedIds;
      expect(ids.includes(post.id)).toBe(vector.readable);
      if (vector.facts.viewerId !== null) {
        const reaction = (
          vector.facts.viewerId === vector.facts.ownerId ? owner : peer
        ).setReaction({ postId: post.id, active: true }, commandKey(3));
        if (vector.reactive)
          await expect(reaction).resolves.toMatchObject({ data: { active: true } });
        else await expect(reaction).rejects.toMatchObject({ code: 'unavailable' });
      }
    });
  }

  it('R6/R7 replay는 뒤의 범위 축소/철회 뒤 현재 canonical 상태를 읽는다', async () => {
    const { server, owner } = await setup();
    const original = (await owner.saveCategory(INPUT, commandKey(1))).data;
    const privateInput = {
      ...INPUT,
      id: original.id,
      expectedVersion: original.version,
      visibility: 'private' as const,
    };
    const narrowed = (await owner.saveCategory(privateInput, commandKey(2))).data;
    expect((await owner.saveCategory(INPUT, commandKey(1))).data).toMatchObject({
      visibility: 'private',
      version: narrowed.version,
    });
    await owner.revokeCategory(
      { id: original.id, expectedVersion: narrowed.version },
      commandKey(3),
    );
    expect((await owner.saveCategory(INPUT, commandKey(1))).data).toMatchObject({
      visibility: 'private',
      version: narrowed.version + 1,
    });
    const receipts = [...server.state.receipts.values()];
    expect(receipts.every((receipt) => JSON.stringify(receipt).includes('공부') === false)).toBe(
      true,
    );
  });

  it('R14 off/read-only는 metadata 변경 없이 private 철회만 허용한다', async () => {
    for (const mode of ['off', 'read-only'] as const) {
      const { server, owner } = await setup();
      const category = (await owner.saveCategory(INPUT, commandKey(1))).data;
      server.state.mode = mode;
      await expect(
        owner.saveCategory(
          { ...INPUT, id: category.id, expectedVersion: category.version, visibility: 'friends' },
          commandKey(2),
        ),
      ).rejects.toMatchObject({ code: 'social-disabled' });
      await expect(
        owner.saveCategory(
          {
            ...INPUT,
            id: category.id,
            expectedVersion: category.version,
            visibility: 'private',
            name: '다른 이름',
          },
          commandKey(3),
        ),
      ).rejects.toMatchObject({ code: 'social-disabled' });
      await expect(
        owner.saveCategory(
          { ...INPUT, id: category.id, expectedVersion: category.version, visibility: 'private' },
          commandKey(4),
        ),
      ).resolves.toMatchObject({ data: { visibility: 'private' } });
    }
  });

  it('R7 오래된 미리보기/타인의 category/한쪽만 있는 version을 거절한다', async () => {
    const { owner, peer } = await setup();
    const category = (await owner.saveCategory(INPUT, commandKey(1))).data;
    await expect(
      peer.createPost(
        {
          text: '완료',
          happenedOn: '2026-09-30',
          categoryId: category.id,
          categoryVersion: category.version,
        },
        commandKey(2),
      ),
    ).rejects.toMatchObject({ code: 'unavailable' });
    await owner.saveCategory(
      { ...INPUT, id: category.id, expectedVersion: category.version, visibility: 'friends' },
      commandKey(3),
    );
    await expect(
      owner.createPost(
        {
          text: '완료',
          happenedOn: '2026-09-30',
          categoryId: category.id,
          categoryVersion: category.version,
        },
        commandKey(4),
      ),
    ).rejects.toMatchObject({ code: 'conflict' });
  });
  it('R13 inactive owner 즉시 숨김과 post DTO owner 관리 필드 생략', async () => {
    const { server, owner } = await setup();
    const category = (await owner.saveCategory(INPUT, commandKey(1))).data;
    const created = (
      await owner.createPost(
        {
          text: '완료',
          happenedOn: '2026-09-30',
          categoryId: category.id,
          categoryVersion: category.version,
        },
        commandKey(2),
      )
    ).data;
    const publicPort = server.publicForActor();
    expect((await publicPort.feed()).data.items).toHaveLength(1);
    await owner.revokeCategory(
      { id: category.id, expectedVersion: category.version },
      commandKey(3),
    );
    const ownPost = (await owner.myPosts()).data.items[0];
    expect(ownPost.category).not.toHaveProperty('postCount');
    expect(ownPost.category).not.toHaveProperty('revoked');
    expect((await owner.category({ id: category.id })).data.revoked).toBe(true);
    server.state.deleted.add('owner');
    expect((await publicPort.validatePosts({ ids: [created.id] })).data.allowedIds).toEqual([]);
    await expect(publicPort.post({ id: created.id })).rejects.toMatchObject({
      code: 'unavailable',
    });
  });
  it('R7 actor당 하루 사본20개 상한은 동일 key 재시도를 중복 생성하지 않는다', async () => {
    const { server, owner } = await setup();
    for (let index = 1; index <= 20; index += 1)
      await owner.createPost({ text: '완료', happenedOn: '2026-09-30' }, commandKey(index));
    await owner.createPost({ text: '완료', happenedOn: '2026-09-30' }, commandKey(20));
    await expect(
      owner.createPost({ text: '완료', happenedOn: '2026-09-30' }, commandKey(21)),
    ).rejects.toMatchObject({ code: 'limit-reached' });
    expect(server.state.posts.size).toBe(20);
  });
});
