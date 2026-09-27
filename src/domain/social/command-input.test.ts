import {
  parseBlockInput,
  parseEmptyInput,
  parseInviteIdInput,
  parsePeerVersionInput,
  parsePostIdInput,
  parsePostIdsInput,
  parseProfileInput,
  parseReactionInput,
  parseRenameInput,
  parseTokenInput,
} from '@/domain/social/command-input';
import { ACTOR_A } from '@/domain/social/social-vectors';

describe('Phase 3 명령 DTO whitelist', () => {
  it('프로필 생성·변경은 별명과 정수 version만', () => {
    expect(parseProfileInput({ nickname: ' 가 ' })).toEqual({
      ok: true,
      value: { nickname: '가' },
    });
    expect(parseProfileInput({ nickname: '가', sub: 'private' }).ok).toBe(false);
    expect(parseRenameInput({ nickname: '가', expectedVersion: 0 }).ok).toBe(true);
    expect(parseRenameInput({ nickname: '가', expectedVersion: -1 }).ok).toBe(false);
    expect(parseRenameInput({ nickname: '가', expectedVersion: 1.5 }).ok).toBe(false);
    expect(parseRenameInput({ nickname: '가' }).ok).toBe(false);
  });

  it('초대 원문과 해시 id를 구분하고 초과 필드를 거절', () => {
    expect(parseEmptyInput({}).ok).toBe(true);
    expect(parseEmptyInput({ actorId: ACTOR_A }).ok).toBe(false);
    expect(parseTokenInput({ token: 'a'.repeat(64) }).ok).toBe(true);
    expect(parseTokenInput({ token: 'a'.repeat(63) }).ok).toBe(false);
    expect(parseInviteIdInput({ inviteId: 'b'.repeat(64) }).ok).toBe(true);
    expect(parseInviteIdInput({ inviteId: 'b'.repeat(64), token: 'a'.repeat(64) }).ok).toBe(false);
  });

  it('관계 CAS와 차단 해제는 expectedVersion 필수', () => {
    expect(parsePeerVersionInput({ peerId: ACTOR_A, expectedVersion: 0 }).ok).toBe(true);
    expect(parsePeerVersionInput({ peerId: ACTOR_A }).ok).toBe(false);
    expect(parsePeerVersionInput({ peerId: ACTOR_A, expectedVersion: 0, sid: 'x' }).ok).toBe(false);
    expect(parseBlockInput({ peerId: ACTOR_A, blocked: true }).ok).toBe(true);
    expect(parseBlockInput({ peerId: ACTOR_A, blocked: false }).ok).toBe(false);
    expect(parseBlockInput({ peerId: ACTOR_A, blocked: false, expectedVersion: 1 }).ok).toBe(true);
  });

  it('공유 id·응원·일괄 읽기는 공개 id 형식과 한도를 확인', () => {
    expect(parsePostIdInput({ id: ACTOR_A }).ok).toBe(true);
    expect(parsePostIdInput({ id: 'local-todo' }).ok).toBe(false);
    expect(parseReactionInput({ postId: ACTOR_A, active: false }).ok).toBe(true);
    expect(parseReactionInput({ postId: ACTOR_A, active: 0 }).ok).toBe(false);
    expect(parsePostIdsInput({ ids: [ACTOR_A] }).ok).toBe(true);
    expect(parsePostIdsInput({ ids: Array(51).fill(ACTOR_A) }).ok).toBe(false);
    expect(parsePostIdsInput({ ids: [ACTOR_A, ACTOR_A] }).ok).toBe(false);
    expect(parsePostIdsInput({ ids: [ACTOR_A], memo: 'private' }).ok).toBe(false);
  });
});
