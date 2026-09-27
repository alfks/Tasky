/** 도메인·메모리 구현·Worker D1이 복사 없이 사용하는 Phase 3 공통 벡터. */
import type { CommandReceipt } from '@/domain/social/idempotency';
import type { PairFacts, PairPlan } from '@/domain/social/relationship';
import type { ActorFacts, FriendshipFacts } from '@/domain/social/social';

export const ACTOR_A = '0000000000000000000000000000000a';
export const ACTOR_B = '0000000000000000000000000000000b';
export const ACTOR_C = '0000000000000000000000000000000c';
export const VECTOR_NOW = 1_800_000_000_000;
export const VECTOR_KEY = `v1.${VECTOR_NOW}.00000000000000000000000000000001`;
export const VECTOR_OLD_KEY = `v1.${VECTOR_NOW - 24 * 60 * 60 * 1000 - 1}.00000000000000000000000000000002`;

export const ACTIVE_ACTOR: ActorFacts = {
  actorId: ACTOR_A,
  isSessionActive: true,
  isAccountActive: true,
  isProfileActive: true,
};
export const FRIENDSHIP: FriendshipFacts = {
  isAccepted: true,
  isPeerActive: true,
  isBlockedByActor: false,
  isBlockedByPeer: false,
};

export type ReadVector = {
  name: string;
  actor: ActorFacts;
  authorId: string;
  authorIsActive: boolean;
  friendship: FriendshipFacts;
  expected: 'allowed' | 'unavailable' | 'unauthorized' | 'account-deleted';
};
export const SOCIAL_READ_VECTORS: readonly ReadVector[] = [
  {
    name: 'R1 자기 공유만 읽기',
    actor: ACTIVE_ACTOR,
    authorId: ACTOR_A,
    authorIsActive: true,
    friendship: { ...FRIENDSHIP, isAccepted: false },
    expected: 'allowed',
  },
  {
    name: 'R4 요청만 있는 상대 본문 불가',
    actor: ACTIVE_ACTOR,
    authorId: ACTOR_B,
    authorIsActive: true,
    friendship: { ...FRIENDSHIP, isAccepted: false },
    expected: 'unavailable',
  },
  {
    name: 'R7 수락된 친구의 과거 공유 읽기',
    actor: ACTIVE_ACTOR,
    authorId: ACTOR_B,
    authorIsActive: true,
    friendship: FRIENDSHIP,
    expected: 'allowed',
  },
  {
    name: 'R6 내가 차단한 상대 읽기 불가',
    actor: ACTIVE_ACTOR,
    authorId: ACTOR_B,
    authorIsActive: true,
    friendship: { ...FRIENDSHIP, isBlockedByActor: true },
    expected: 'unavailable',
  },
  {
    name: 'R6 상대가 차단한 경우도 같은 공개 결과',
    actor: ACTIVE_ACTOR,
    authorId: ACTOR_B,
    authorIsActive: true,
    friendship: { ...FRIENDSHIP, isBlockedByPeer: true },
    expected: 'unavailable',
  },
  {
    name: 'R14 삭제된 작성자의 글 불가',
    actor: ACTIVE_ACTOR,
    authorId: ACTOR_B,
    authorIsActive: false,
    friendship: FRIENDSHIP,
    expected: 'unavailable',
  },
  {
    name: '세션 종료 뒤 읽기 불가',
    actor: { ...ACTIVE_ACTOR, isSessionActive: false },
    authorId: ACTOR_B,
    authorIsActive: true,
    friendship: FRIENDSHIP,
    expected: 'unauthorized',
  },
  {
    name: '계정 삭제 뒤 읽기 불가',
    actor: { ...ACTIVE_ACTOR, isAccountActive: false },
    authorId: ACTOR_B,
    authorIsActive: true,
    friendship: FRIENDSHIP,
    expected: 'account-deleted',
  },
];

const NONE = {
  lo: ACTOR_A,
  hi: ACTOR_B,
  state: 'none',
  requesterId: null,
  requestedAt: null,
  version: 3,
} as const;
const PENDING = {
  ...NONE,
  state: 'pending',
  requesterId: ACTOR_B,
  requestedAt: VECTOR_NOW - 1000,
} as const;
const ACCEPTED = { ...NONE, state: 'accepted' } as const;
const BASE_PAIR_FACTS: PairFacts = {
  actorId: ACTOR_A,
  peerId: ACTOR_B,
  pair: NONE,
  action: 'request',
  nowMs: VECTOR_NOW,
  isBlockedByActor: false,
  isBlockedByPeer: false,
  actorFriendCount: 0,
  peerFriendCount: 0,
};
const BLOCKED_ACCEPT: PairFacts = { ...BASE_PAIR_FACTS, pair: PENDING, action: 'accept' };
export type PairVector = { name: string; facts: PairFacts; expected: PairPlan };
export const SOCIAL_PAIR_VECTORS: readonly PairVector[] = [
  {
    name: 'R4 요청은 pending이며 version 증가',
    facts: BASE_PAIR_FACTS,
    expected: {
      ok: true,
      pair: { ...PENDING, requesterId: ACTOR_A, requestedAt: VECTOR_NOW, version: 4 },
      clearReactions: false,
    },
  },
  {
    name: 'R4 역방향 pending 자동 수락 금지',
    facts: { ...BASE_PAIR_FACTS, pair: PENDING },
    expected: { ok: false, code: 'request-pending' },
  },
  {
    name: 'R5 수신자만 수락',
    facts: { ...BASE_PAIR_FACTS, pair: PENDING, action: 'accept', expectedVersion: 3 },
    expected: { ok: true, pair: { ...ACCEPTED, version: 4 }, clearReactions: false },
  },
  {
    name: 'R5 발신자 수락 불가',
    facts: {
      ...BASE_PAIR_FACTS,
      pair: { ...PENDING, requesterId: ACTOR_A },
      action: 'accept',
      expectedVersion: 3,
    },
    expected: { ok: false, code: 'unavailable' },
  },
  {
    name: 'R5 stale 수락은 version 불변',
    facts: { ...BASE_PAIR_FACTS, pair: PENDING, action: 'accept', expectedVersion: 2 },
    expected: { ok: false, code: 'conflict' },
  },
  {
    name: 'R5 차단 actor의 stale 수락 비노출',
    facts: { ...BLOCKED_ACCEPT, isBlockedByActor: true, expectedVersion: 2 },
    expected: { ok: false, code: 'unavailable' },
  },
  {
    name: 'R5 차단 peer의 matching 수락 비노출',
    facts: { ...BLOCKED_ACCEPT, isBlockedByPeer: true, expectedVersion: 3 },
    expected: { ok: false, code: 'unavailable' },
  },
  {
    name: 'R5 친구 삭제는 none tombstone과 반응 삭제',
    facts: { ...BASE_PAIR_FACTS, pair: ACCEPTED, action: 'remove', expectedVersion: 3 },
    expected: { ok: true, pair: { ...NONE, version: 4 }, clearReactions: true },
  },
  {
    name: 'R5 차단된 none 친구 삭제 비노출',
    facts: { ...BASE_PAIR_FACTS, action: 'remove', isBlockedByActor: true, expectedVersion: 3 },
    expected: { ok: false, code: 'unavailable' },
  },
  {
    name: 'R6 차단은 pair 없어도 version 증가',
    facts: { ...BASE_PAIR_FACTS, pair: undefined, action: 'block' },
    expected: { ok: true, pair: { ...NONE, version: 1 }, setBlock: true, clearReactions: true },
  },
  {
    name: 'R6 늦은 차단 해제는 새 차단을 못 지움',
    facts: { ...BASE_PAIR_FACTS, action: 'unblock', isBlockedByActor: true, expectedVersion: 2 },
    expected: { ok: false, code: 'conflict' },
  },
  {
    name: 'R6 차단 해제는 관계를 복원하지 않음',
    facts: { ...BASE_PAIR_FACTS, action: 'unblock', isBlockedByActor: true, expectedVersion: 3 },
    expected: { ok: true, pair: { ...NONE, version: 4 }, setBlock: false, clearReactions: false },
  },
  {
    name: 'R4 만료 요청은 수락 불가',
    facts: {
      ...BASE_PAIR_FACTS,
      pair: { ...PENDING, requestedAt: VECTOR_NOW - 7 * 24 * 60 * 60 * 1000 },
      action: 'accept',
      expectedVersion: 3,
    },
    expected: { ok: false, code: 'request-expired' },
  },
];

export const VECTOR_RECEIPT: CommandReceipt = {
  actorId: ACTOR_A,
  key: VECTOR_OLD_KEY,
  requestHash: 'same-method-path-schema-dto',
  executionNonce: 'first-execution',
  resultCode: 'ok',
  resourceId: ACTOR_C,
  resultVersion: null,
};
export type CommandVector = {
  name: string;
  actor: ActorFacts;
  key: string;
  requestHash: string;
  receipt: CommandReceipt | undefined;
  expected:
    | 'execute'
    | 'replay'
    | 'idempotency-conflict'
    | 'request-expired'
    | 'unauthorized'
    | 'account-deleted';
};
export const SOCIAL_COMMAND_VECTORS: readonly CommandVector[] = [
  {
    name: 'R13 신규 key 실행',
    actor: ACTIVE_ACTOR,
    key: VECTOR_KEY,
    requestHash: VECTOR_RECEIPT.requestHash,
    receipt: undefined,
    expected: 'execute',
  },
  {
    name: 'R13 24시간 후 기존 receipt 동일 요청 재확인',
    actor: ACTIVE_ACTOR,
    key: VECTOR_OLD_KEY,
    requestHash: VECTOR_RECEIPT.requestHash,
    receipt: VECTOR_RECEIPT,
    expected: 'replay',
  },
  {
    name: 'R13 같은 key 다른 method/path 또는 body 충돌',
    actor: ACTIVE_ACTOR,
    key: VECTOR_OLD_KEY,
    requestHash: 'changed-method-or-body',
    receipt: VECTOR_RECEIPT,
    expected: 'idempotency-conflict',
  },
  {
    name: 'R13 24시간 후 receipt 없으면 새 실행 거부',
    actor: ACTIVE_ACTOR,
    key: VECTOR_OLD_KEY,
    requestHash: VECTOR_RECEIPT.requestHash,
    receipt: undefined,
    expected: 'request-expired',
  },
  {
    name: 'R13 다른 actor는 같은 key receipt를 재생하지 못함',
    actor: { ...ACTIVE_ACTOR, actorId: ACTOR_B },
    key: VECTOR_OLD_KEY,
    requestHash: VECTOR_RECEIPT.requestHash,
    receipt: VECTOR_RECEIPT,
    expected: 'request-expired',
  },
  {
    name: 'R13 48시간 GC 뒤 과거 key 재실행 거부',
    actor: ACTIVE_ACTOR,
    key: `v1.${VECTOR_NOW - 49 * 60 * 60 * 1000}.00000000000000000000000000000003`,
    requestHash: VECTOR_RECEIPT.requestHash,
    receipt: undefined,
    expected: 'request-expired',
  },
  {
    name: 'R14 세션 취소 시 receipt도 재생 불가',
    actor: { ...ACTIVE_ACTOR, isSessionActive: false },
    key: VECTOR_OLD_KEY,
    requestHash: VECTOR_RECEIPT.requestHash,
    receipt: VECTOR_RECEIPT,
    expected: 'unauthorized',
  },
  {
    name: 'R14 계정 삭제 시 receipt도 재생 불가',
    actor: { ...ACTIVE_ACTOR, isAccountActive: false },
    key: VECTOR_OLD_KEY,
    requestHash: VECTOR_RECEIPT.requestHash,
    receipt: VECTOR_RECEIPT,
    expected: 'account-deleted',
  },
];
