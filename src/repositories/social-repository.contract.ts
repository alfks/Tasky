/** 구현별 테스트에서만 호출하는 온라인 포트 계약. 앱 번들에서는 import하지 않는다. */
import type { PairPlan } from '@/domain/social/relationship';
import {
  SOCIAL_COMMAND_VECTORS,
  SOCIAL_PAIR_VECTORS,
  SOCIAL_READ_VECTORS,
  type CommandVector,
  type PairVector,
  type ReadVector,
} from '@/domain/social/social-vectors';

import type { SocialRepository } from '@/repositories/social-repository';

/** 구현별 fixture는 vector의 facts로 저장소를 세팅하고 실제 포트/DB 결과를 관찰한다. */
export type SocialVectorProbe = {
  read: (vector: ReadVector) => Promise<ReadVector['expected']>;
  pair: (vector: PairVector) => Promise<PairPlan>;
  command: (vector: CommandVector) => Promise<CommandVector['expected']>;
};

export type SocialContractTarget = {
  name: string;
  /** 매 호출마다 비어 있고 mode=enabled인 같은 서버를 보는 세 actor-bound 포트. */
  create: () => Promise<{
    alice: SocialRepository;
    bob: SocialRepository;
    outsider: SocialRepository;
    nowMs: number;
  }>;
  vectors: SocialVectorProbe;
};

function key(nowMs: number, sequence: number): string {
  return `v1.${nowMs}.${sequence.toString(16).padStart(32, '0')}`;
}

export function runSocialRepositoryContract(target: SocialContractTarget): void {
  describe(`SocialRepository (${target.name})`, () => {
    for (const vector of SOCIAL_READ_VECTORS) {
      it(`공통 조회 벡터: ${vector.name}`, async () => {
        expect(await target.vectors.read(vector)).toBe(vector.expected);
      });
    }
    for (const vector of SOCIAL_PAIR_VECTORS) {
      it(`공통 관계 벡터: ${vector.name}`, async () => {
        expect(await target.vectors.pair(vector)).toEqual(vector.expected);
      });
    }
    for (const vector of SOCIAL_COMMAND_VECTORS) {
      it(`공통 명령 벡터: ${vector.name}`, async () => {
        expect(await target.vectors.command(vector)).toBe(vector.expected);
      });
    }

    it('R3 프로필은 명시적으로만 생기고 공개 필드만 반환', async () => {
      const { alice } = await target.create();
      expect((await alice.me()).data.profile).toBeNull();
      const profile = (await alice.createProfile({ nickname: '가' })).data;
      expect(Object.keys(profile).sort()).toEqual(['id', 'nickname', 'version']);
      expect((await alice.me()).data.profile).toEqual(profile);
    });

    it('R1/R4/R7/R8 공유 사본은 친구 수락 뒤에만 보이고 응원은 한 개', async () => {
      const { alice, bob, outsider, nowMs } = await target.create();
      const a = (await alice.createProfile({ nickname: '가' })).data;
      const b = (await bob.createProfile({ nickname: '나' })).data;
      await outsider.createProfile({ nickname: '다' });
      const post = (
        await alice.createPost({ text: '완료', happenedOn: '2026-09-28' }, { key: key(nowMs, 1) })
      ).data;
      expect((await bob.feed()).data.items).toEqual([]);
      expect((await outsider.feed()).data.items).toEqual([]);
      const invite = (await alice.createInvite({ key: key(nowMs, 2) })).data;
      if (!('token' in invite)) throw new Error('새 초대는 원문 token을 반환해야 합니다.');
      expect((await bob.previewInvite({ token: invite.token })).data.nickname).toBe(a.nickname);
      const request = (await bob.sendRequest({ token: invite.token }, { key: key(nowMs, 3) })).data;
      expect(request.peerId).toBe(a.id);
      await alice.acceptRequest(
        { peerId: b.id, expectedVersion: request.pairVersion },
        { key: key(nowMs, 4) },
      );
      const feed = (await bob.feed()).data.items;
      expect(feed.map((item) => item.id)).toEqual([post.id]);
      expect(feed[0].text).toBe('완료');
      await bob.setReaction({ postId: post.id, active: true }, { key: key(nowMs, 5) });
      expect((await alice.feed()).data.items[0].reactionCount).toBe(1);
      expect((await outsider.feed()).data.items).toEqual([]);
    });

    it('R13 동일 key 재시도는 공유 하나, 다른 body는 충돌', async () => {
      const { alice, nowMs } = await target.create();
      await alice.createProfile({ nickname: '가' });
      const options = { key: key(nowMs, 6) };
      const input = { text: '같은 문장', happenedOn: '2026-09-28' };
      const first = await alice.createPost(input, options);
      const again = await alice.createPost(input, options);
      expect(again.data.id).toBe(first.data.id);
      expect((await alice.myPosts()).data.items.map((item) => item.id)).toEqual([first.data.id]);
      await expect(
        alice.createPost({ ...input, text: '다른 문장' }, options),
      ).rejects.toMatchObject({ code: 'idempotency-conflict' });
    });
  });
}
