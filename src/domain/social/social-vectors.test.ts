import {
  actorAccess,
  ownResourceAccess,
  postReadAccess,
  reactionAccess,
} from '@/domain/social/access';
import {
  canonicalCommandRequest,
  keyTimestamp,
  isFreshNewKey,
  planCommandAttempt,
  readCommandResult,
} from '@/domain/social/idempotency';
import { effectiveInviteStatus, planInviteRevoke, planInviteUse } from '@/domain/social/invite';
import { modeAllows } from '@/domain/social/mode';
import { planReactionSet } from '@/domain/social/reaction';
import {
  isPendingExpired,
  pairIds,
  planExpiredPairCleanup,
  planPairChange,
} from '@/domain/social/relationship';
import {
  ACTOR_A,
  ACTOR_B,
  ACTIVE_ACTOR,
  FRIENDSHIP,
  SOCIAL_COMMAND_VECTORS,
  SOCIAL_PAIR_VECTORS,
  SOCIAL_READ_VECTORS,
  VECTOR_KEY,
  VECTOR_NOW,
  VECTOR_OLD_KEY,
  VECTOR_RECEIPT,
} from '@/domain/social/social-vectors';

describe('Phase 3 공통 벡터', () => {
  for (const vector of SOCIAL_READ_VECTORS) {
    it(vector.name, () => {
      const result = postReadAccess(
        vector.actor,
        vector.authorId,
        vector.authorIsActive,
        vector.friendship,
      );
      expect(result.allowed ? 'allowed' : result.code).toBe(vector.expected);
    });
  }
  for (const vector of SOCIAL_PAIR_VECTORS) {
    it(vector.name, () => expect(planPairChange(vector.facts)).toEqual(vector.expected));
  }
  for (const vector of SOCIAL_COMMAND_VECTORS) {
    it(vector.name, () => {
      const plan = planCommandAttempt(
        vector.actor,
        vector.key,
        vector.requestHash,
        VECTOR_NOW,
        vector.receipt,
      );
      expect(plan.kind === 'reject' ? plan.code : plan.kind).toBe(vector.expected);
    });
  }
});

describe('R4 초대 상태', () => {
  it('active만 시각으로 만료되고 used/revoked는 원래 상태를 유지', () => {
    expect(effectiveInviteStatus('active', VECTOR_NOW, VECTOR_NOW)).toBe('expired');
    expect(effectiveInviteStatus('used', VECTOR_NOW, VECTOR_NOW)).toBe('used');
    expect(effectiveInviteStatus('revoked', VECTOR_NOW, VECTOR_NOW)).toBe('revoked');
  });
  it('사용·취소는 주체와 한도 및 시각에 따라 단회로 판정', () => {
    const facts = {
      ownerId: ACTOR_A,
      actorId: ACTOR_B,
      status: 'active' as const,
      expiresAt: VECTOR_NOW + 1000,
      nowMs: VECTOR_NOW,
      isBlocked: false,
      isAlreadyFriend: false,
      isAtLimit: false,
    };
    expect(planInviteUse(facts)).toEqual({ ok: true, nextStatus: 'used' });
    expect(planInviteUse({ ...facts, status: 'used' })).toEqual({ ok: false, code: 'unavailable' });
    expect(planInviteUse({ ...facts, isAtLimit: true })).toEqual({
      ok: false,
      code: 'limit-reached',
    });
    expect(planInviteUse({ ...facts, isBlocked: true })).toEqual({
      ok: false,
      code: 'unavailable',
    });
    expect(planInviteRevoke({ ...facts, actorId: ACTOR_A })).toEqual({
      ok: true,
      nextStatus: 'revoked',
    });
    expect(planInviteRevoke(facts)).toEqual({ ok: false, code: 'unavailable' });
  });
});

describe('R5/R6/R8 권한·관계', () => {
  it('pair key는 어느 방향에서나 같은 코드 단위 순서', () => {
    expect(pairIds(ACTOR_A, ACTOR_B)).toEqual(pairIds(ACTOR_B, ACTOR_A));
  });
  it('인증과 소유가 독립이며 본인 글에는 응원하지 못한다', () => {
    expect(actorAccess(ACTIVE_ACTOR)).toEqual({ allowed: true });
    expect(ownResourceAccess(ACTIVE_ACTOR, ACTOR_B)).toEqual({
      allowed: false,
      code: 'unavailable',
    });
    expect(reactionAccess(ACTIVE_ACTOR, ACTOR_A, true, FRIENDSHIP)).toEqual({
      allowed: false,
      code: 'unavailable',
    });
    expect(reactionAccess(ACTIVE_ACTOR, ACTOR_B, true, FRIENDSHIP)).toEqual({ allowed: true });
  });
  it('만료 pending 정리는 버전을 한 번만 올리고 뒤늦은 수락을 막는다', () => {
    const pair = {
      ...pairIds(ACTOR_A, ACTOR_B),
      state: 'pending' as const,
      requesterId: ACTOR_A,
      requestedAt: VECTOR_NOW - 7 * 24 * 60 * 60 * 1000,
      version: 7,
    };
    expect(isPendingExpired(pair, VECTOR_NOW)).toBe(true);
    expect(planExpiredPairCleanup(pair, VECTOR_NOW)).toEqual({
      ...pair,
      state: 'none',
      requesterId: null,
      requestedAt: null,
      version: 8,
    });
    expect(planExpiredPairCleanup(pair, VECTOR_NOW - 1)).toBeNull();
  });
  it('R8 응원 설정은 toggle이 아니며 같은 상태 재시도는 변화가 없다', () => {
    expect(planReactionSet(ACTIVE_ACTOR, ACTOR_B, true, FRIENDSHIP, true, true)).toEqual({
      ok: true,
      nextActive: true,
      changed: false,
    });
    expect(planReactionSet(ACTIVE_ACTOR, ACTOR_A, true, FRIENDSHIP, false, true)).toEqual({
      ok: false,
      code: 'unavailable',
    });
  });
});

describe('R16 기능 모드', () => {
  it('off도 자기 관리와 철회·계정 삭제 허용', () => {
    expect(modeAllows('off', 'read-own')).toBe(true);
    expect(modeAllows('off', 'withdraw')).toBe(true);
    expect(modeAllows('off', 'delete-account')).toBe(true);
    expect(modeAllows('off', 'read-shared')).toBe(false);
    expect(modeAllows('off', 'preview-invite')).toBe(false);
  });
  it('read-only는 공유 읽기/초대 확인을 허용하고 생성·이름 변경을 거절', () => {
    expect(modeAllows('read-only', 'read-shared')).toBe(true);
    expect(modeAllows('read-only', 'preview-invite')).toBe(true);
    expect(modeAllows('read-only', 'create')).toBe(false);
    expect(modeAllows('read-only', 'rename-profile')).toBe(false);
  });
  it('enabled는 전체 기능', () => expect(modeAllows('enabled', 'create')).toBe(true));
});

describe('R13 영수증 경계', () => {
  it('서버 해시 입력은 method/path/schema와 DTO 키 순서까지 정규화', () => {
    const first = canonicalCommandRequest('POST', '/api/social/posts', 1, {
      text: '기록',
      happenedOn: '2026-09-28',
    });
    const reordered = canonicalCommandRequest('POST', '/api/social/posts', 1, {
      happenedOn: '2026-09-28',
      text: '기록',
    });
    expect(first).toBe(reordered);
    expect(
      canonicalCommandRequest('POST', '/api/social/profile/name', 1, {
        text: '기록',
        happenedOn: '2026-09-28',
      }),
    ).not.toBe(first);
    expect(
      canonicalCommandRequest('PATCH', '/api/social/posts', 1, {
        text: '기록',
        happenedOn: '2026-09-28',
      }),
    ).not.toBe(first);
  });
  it('문법과 신규 freshness를 분리하고 양쪽 경계를 포함', () => {
    expect(keyTimestamp(VECTOR_KEY)).toBe(VECTOR_NOW);
    expect(keyTimestamp('bad-key')).toBeNull();
    expect(isFreshNewKey(VECTOR_NOW - 24 * 60 * 60 * 1000, VECTOR_NOW)).toBe(true);
    expect(isFreshNewKey(VECTOR_NOW + 5 * 60 * 1000, VECTOR_NOW)).toBe(true);
    expect(isFreshNewKey(VECTOR_NOW - 24 * 60 * 60 * 1000 - 1, VECTOR_NOW)).toBe(false);
    expect(isFreshNewKey(VECTOR_NOW + 5 * 60 * 1000 + 1, VECTOR_NOW)).toBe(false);
  });
  it('기존 receipt는 재실행 없이 최소 결과만 반환하고 ACL 본문은 따로 검증', () => {
    expect(
      readCommandResult(
        ACTIVE_ACTOR,
        VECTOR_OLD_KEY,
        VECTOR_RECEIPT.requestHash,
        'retry',
        VECTOR_RECEIPT,
      ),
    ).toEqual({
      ok: true,
      resourceId: VECTOR_RECEIPT.resourceId,
      resultVersion: null,
      didApply: false,
    });
    expect(
      postReadAccess(ACTIVE_ACTOR, ACTOR_B, true, { ...FRIENDSHIP, isBlockedByPeer: true }),
    ).toEqual({
      allowed: false,
      code: 'unavailable',
    });
  });
  it('첫 조건부 검사 0행/확정 오류를 성공으로 바꾸지 않는다', () => {
    expect(
      readCommandResult(
        ACTIVE_ACTOR,
        VECTOR_OLD_KEY,
        VECTOR_RECEIPT.requestHash,
        'first-execution',
        undefined,
      ),
    ).toEqual({
      ok: false,
      code: 'unavailable',
    });
    expect(
      readCommandResult(
        ACTIVE_ACTOR,
        VECTOR_OLD_KEY,
        VECTOR_RECEIPT.requestHash,
        'first-execution',
        {
          ...VECTOR_RECEIPT,
          resultCode: 'conflict',
        },
      ),
    ).toEqual({ ok: false, code: 'conflict' });
    expect(
      readCommandResult(
        ACTIVE_ACTOR,
        VECTOR_OLD_KEY,
        VECTOR_RECEIPT.requestHash,
        'first-execution',
        VECTOR_RECEIPT,
      ),
    ).toEqual({
      ok: true,
      resourceId: VECTOR_RECEIPT.resourceId,
      resultVersion: null,
      didApply: true,
    });
  });
});
