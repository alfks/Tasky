import { expect, it } from 'vitest';

import {
  ACTOR_A,
  ACTOR_B,
  VECTOR_NOW,
  type CommandVector,
  type ReadVector,
} from '@/domain/social/social-vectors';

import { sha256 } from '@/repositories/memory/social/hash';
import { attemptCommand } from '@/repositories/memory/social/model';
import { applyPairFacts, blockKey, pairKey } from '@/repositories/memory/social/relations';
import { createMemorySocialServer } from '@/repositories/memory/social-repository';
import {
  runSocialRepositoryContract,
  type SocialContractTarget,
} from '@/repositories/social-repository.contract';

async function readProbe(vector: ReadVector): Promise<ReadVector['expected']> {
  const server = createMemorySocialServer({ now: () => VECTOR_NOW });
  const { state } = server;
  state.profiles.set('alice', { id: ACTOR_A, nickname: '가', version: 1 });
  state.profiles.set('bob', { id: ACTOR_B, nickname: '나', version: 1 });
  const reader = server.forActor('alice');
  if (!vector.actor.isSessionActive) state.sessionActive.delete('alice');
  if (!vector.actor.isAccountActive) state.deleted.add('alice');
  if (!vector.authorIsActive) state.profiles.delete('bob');
  if (vector.friendship.isAccepted) {
    state.pairs.set(pairKey(ACTOR_A, ACTOR_B), {
      lo: ACTOR_A,
      hi: ACTOR_B,
      state: 'accepted',
      requesterId: null,
      requestedAt: null,
      version: 1,
    });
  }
  if (vector.friendship.isBlockedByActor) state.blocks.add(blockKey(ACTOR_A, ACTOR_B));
  if (vector.friendship.isBlockedByPeer) state.blocks.add(blockKey(ACTOR_B, ACTOR_A));
  state.posts.set('000000000000000000000000000000ff', {
    id: '000000000000000000000000000000ff',
    authorId: vector.authorId,
    text: '완료',
    happenedOn: '2026-09-28',
    createdAt: VECTOR_NOW,
  });
  try {
    const result = await reader.feed();
    return result.data.items.length > 0 ? 'allowed' : 'unavailable';
  } catch (error) {
    if (error instanceof Error && 'code' in error) {
      return error.code as ReadVector['expected'];
    }
    throw error;
  }
}

function commandProbe(vector: CommandVector): Promise<CommandVector['expected']> {
  const result = attemptCommand(
    vector.actor,
    vector.key,
    vector.requestHash,
    VECTOR_NOW,
    vector.receipt,
  );
  if (result.kind !== 'reject') return Promise.resolve(result.kind);
  if (
    result.code === 'unauthorized' ||
    result.code === 'account-deleted' ||
    result.code === 'idempotency-conflict' ||
    result.code === 'request-expired'
  ) {
    return Promise.resolve(result.code);
  }
  throw new Error(`예상하지 못한 벡터 결과: ${result.code}`);
}

const MEMORY: SocialContractTarget = {
  name: 'memory-social',
  create: async () => {
    const server = createMemorySocialServer({ now: () => VECTOR_NOW });
    return {
      alice: server.forActor('alice'),
      bob: server.forActor('bob'),
      outsider: server.forActor('outsider'),
      nowMs: VECTOR_NOW,
    };
  },
  vectors: {
    read: readProbe,
    pair: async (vector) =>
      applyPairFacts(createMemorySocialServer({ now: () => VECTOR_NOW }).state, vector.facts),
    command: commandProbe,
  },
};

runSocialRepositoryContract(MEMORY);

function commandKey(sequence: number): string {
  return `v1.${VECTOR_NOW}.${sequence.toString(16).padStart(32, '0')}`;
}

it('프로필 생성 버전 0에서 첫 이름 변경이 1로 전이한다', async () => {
  const server = createMemorySocialServer({ now: () => VECTOR_NOW });
  const alice = server.forActor('alice');
  const created = (await alice.createProfile({ nickname: '가' })).data;
  expect(created.version).toBe(0);
  const key = `v1.${VECTOR_NOW}.${'0'.repeat(31)}1`;
  const renamed = (await alice.renameProfile({ nickname: '나', expectedVersion: 0 }, { key })).data;
  expect(renamed.version).toBe(1);
});

it('초대 receipt는 원문을 저장하지 않고 같은 key 재생에 hash만 돌려준다', async () => {
  const server = createMemorySocialServer({ now: () => VECTOR_NOW });
  const alice = server.forActor('alice');
  await alice.createProfile({ nickname: '가' });
  const key = `v1.${VECTOR_NOW}.${'1'.padStart(32, '0')}`;
  const first = (await alice.createInvite({ key })).data;
  expect('token' in first).toBe(true);
  if (!('token' in first)) return;
  expect(
    JSON.stringify({
      invites: [...server.state.invites],
      receipts: [...server.state.receipts.values()],
    }),
  ).not.toContain(first.token);
  const again = (await alice.createInvite({ key })).data;
  expect(again).toEqual({
    inviteId: server.state.invites.get(await sha256(first.token))?.id,
    tokenUnavailable: true,
  });
});

it('초대 사용 성공·확정 오류·재생 receipt와 상태에 원문 token을 남기지 않는다', async () => {
  const server = createMemorySocialServer({ now: () => VECTOR_NOW });
  const alice = server.forActor('alice');
  const bob = server.forActor('bob');
  await alice.createProfile({ nickname: '가' });
  await bob.createProfile({ nickname: '나' });
  const first = (await alice.createInvite({ key: commandKey(31) })).data;
  if (!('token' in first)) throw new Error('최초 원문 token이 없습니다.');
  const request = (await bob.sendRequest({ token: first.token }, { key: commandKey(32) })).data;
  expect((await bob.sendRequest({ token: first.token }, { key: commandKey(32) })).data).toEqual(
    request,
  );
  const second = (await alice.createInvite({ key: commandKey(33) })).data;
  if (!('token' in second)) throw new Error('두 번째 원문 token이 없습니다.');
  await expect(
    bob.sendRequest({ token: second.token }, { key: commandKey(32) }),
  ).rejects.toMatchObject({ code: 'idempotency-conflict' });
  await expect(
    alice.sendRequest({ token: second.token }, { key: commandKey(34) }),
  ).rejects.toMatchObject({ code: 'unavailable' });
  await expect(
    alice.sendRequest({ token: second.token }, { key: commandKey(34) }),
  ).rejects.toMatchObject({ code: 'unavailable' });
  const stored = JSON.stringify({
    invites: [...server.state.invites],
    receipts: [...server.state.receipts.values()],
  });
  expect(stored).not.toContain(first.token);
  expect(stored).not.toContain(second.token);
});

it('동시 같은 key의 초대 생성도 한 번만 발급하고 원문을 재생하지 않는다', async () => {
  const server = createMemorySocialServer({ now: () => VECTOR_NOW });
  const alice = server.forActor('alice');
  await alice.createProfile({ nickname: '가' });
  const [left, right] = await Promise.all([
    alice.createInvite({ key: commandKey(35) }),
    alice.createInvite({ key: commandKey(35) }),
  ]);
  expect([left.data, right.data].filter((item) => 'token' in item)).toHaveLength(1);
  expect(server.state.invites.size).toBe(1);
  expect(server.state.receipts.size).toBe(1);
});

it('포트의 확정 conflict를 receipt로 재생하고 다른 body는 거절한다', async () => {
  const server = createMemorySocialServer({ now: () => VECTOR_NOW });
  const alice = server.forActor('alice');
  const profile = (await alice.createProfile({ nickname: '가' })).data;
  const key = commandKey(11);
  const stale = { nickname: '나', expectedVersion: 9 };
  await expect(alice.renameProfile(stale, { key })).rejects.toMatchObject({ code: 'conflict' });
  expect(server.state.receipts.size).toBe(1);
  server.state.profiles.set('alice', { ...profile, version: 9 });
  await expect(alice.renameProfile(stale, { key })).rejects.toMatchObject({ code: 'conflict' });
  await expect(
    alice.renameProfile({ nickname: '다', expectedVersion: 9 }, { key }),
  ).rejects.toMatchObject({ code: 'idempotency-conflict' });
  expect(server.state.profiles.get('alice')?.nickname).toBe('가');
});

it('mode 선차단과 잘못된 key는 receipt를 남기지 않는다', async () => {
  const server = createMemorySocialServer({ now: () => VECTOR_NOW });
  const alice = server.forActor('alice');
  await alice.createProfile({ nickname: '가' });
  server.state.mode = 'read-only';
  await expect(
    alice.renameProfile({ nickname: '나', expectedVersion: 0 }, { key: commandKey(12) }),
  ).rejects.toMatchObject({ code: 'social-disabled' });
  server.state.mode = 'enabled';
  await expect(
    alice.renameProfile({ nickname: '나', expectedVersion: 0 }, { key: 'bad-key' }),
  ).rejects.toMatchObject({ code: 'validation' });
  expect(server.state.receipts.size).toBe(0);
});

it('친구 keyset cursor는 앞 항목 삭제 뒤 다음 항목을 놓치지 않고 actor·scope·만료를 묶는다', async () => {
  let now = VECTOR_NOW;
  const server = createMemorySocialServer({ now: () => now });
  const alice = server.forActor('alice');
  const bob = server.forActor('bob');
  const a = (await alice.createProfile({ nickname: '가' })).data;
  const peers = [];
  for (const [sub, nickname] of [
    ['bob', '나'],
    ['carol', '다'],
    ['dave', '라'],
  ]) {
    const peer = (await server.forActor(sub).createProfile({ nickname })).data;
    peers.push(peer);
    const [lo, hi] = [a.id, peer.id].sort();
    server.state.pairs.set(pairKey(a.id, peer.id), {
      lo,
      hi,
      state: 'accepted',
      requesterId: null,
      requestedAt: null,
      version: 1,
    });
  }
  const first = (await alice.friends({ limit: 2 })).data;
  expect(first.items.map((item) => item.id)).toEqual(peers.slice(0, 2).map((item) => item.id));
  const cursor = first.nextCursor;
  expect(cursor).not.toBeNull();
  if (cursor === null) return;
  server.state.pairs.delete(pairKey(a.id, peers[0].id));
  expect((await alice.friends({ cursor, limit: 2 })).data.items.map((item) => item.id)).toEqual([
    peers[2].id,
  ]);
  await expect(bob.friends({ cursor })).rejects.toMatchObject({ code: 'validation' });
  await expect(alice.blocks({ cursor })).rejects.toMatchObject({ code: 'validation' });
  await expect(alice.friends({ cursor: `${cursor}x` })).rejects.toMatchObject({
    code: 'validation',
  });
  now += 15 * 60 * 1000;
  await expect(alice.friends({ cursor })).rejects.toMatchObject({ code: 'validation' });
});

it('피드 cursor는 high-water 뒤 새 게시물과 삭제된 앞 게시물에 흔들리지 않는다', async () => {
  const server = createMemorySocialServer({ now: () => VECTOR_NOW });
  const alice = server.forActor('alice');
  await alice.createProfile({ nickname: '가' });
  const ids: string[] = [];
  for (const sequence of [21, 22, 23]) {
    ids.push(
      (
        await alice.createPost(
          { text: '공유', happenedOn: '2026-09-28' },
          { key: commandKey(sequence) },
        )
      ).data.id,
    );
  }
  const first = (await alice.feed({ limit: 2 })).data;
  expect(first.items.map((item) => item.id)).toEqual([ids[2], ids[1]]);
  if (first.nextCursor === null) throw new Error('둘째 페이지 cursor가 없습니다.');
  server.state.posts.delete(ids[2]);
  const newest = (
    await alice.createPost({ text: '새 기록', happenedOn: '2026-09-28' }, { key: commandKey(24) })
  ).data.id;
  const second = (await alice.feed({ cursor: first.nextCursor, limit: 2 })).data;
  expect(second.items.map((item) => item.id)).toEqual([ids[0]]);
  expect(second.items.map((item) => item.id)).not.toContain(newest);
});
