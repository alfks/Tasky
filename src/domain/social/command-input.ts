/** API 명령의 평평한 JSON DTO를 정규화한다. 인증·DB 권한은 Worker가 별도로 확인한다. */
import { isInviteToken, isSocialId, parseNickname, type Validation } from '@/domain/social/input';
import type { SocialId } from '@/domain/social/social';

const INVALID: Validation<never> = { ok: false, code: 'validation' };
const INVITE_ID = /^[0-9a-f]{64}$/u;

function record(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const dto = value as Record<string, unknown>;
  return Object.keys(dto).every((key) => keys.includes(key)) ? dto : null;
}

function version(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

export function parseEmptyInput(value: unknown): Validation<Record<string, never>> {
  return record(value, []) === null ? INVALID : { ok: true, value: {} };
}

export function parseProfileInput(value: unknown): Validation<{ nickname: string }> {
  const dto = record(value, ['nickname']);
  if (dto === null) return INVALID;
  const nickname = parseNickname(dto.nickname);
  return nickname.ok ? { ok: true, value: { nickname: nickname.value } } : INVALID;
}

export function parseRenameInput(
  value: unknown,
): Validation<{ nickname: string; expectedVersion: number }> {
  const dto = record(value, ['nickname', 'expectedVersion']);
  if (dto === null || !version(dto.expectedVersion)) return INVALID;
  const nickname = parseNickname(dto.nickname);
  return nickname.ok
    ? { ok: true, value: { nickname: nickname.value, expectedVersion: dto.expectedVersion } }
    : INVALID;
}

export function parseInviteIdInput(value: unknown): Validation<{ inviteId: string }> {
  const dto = record(value, ['inviteId']);
  return dto !== null && typeof dto.inviteId === 'string' && INVITE_ID.test(dto.inviteId)
    ? { ok: true, value: { inviteId: dto.inviteId } }
    : INVALID;
}

export function parseTokenInput(value: unknown): Validation<{ token: string }> {
  const dto = record(value, ['token']);
  return dto !== null && isInviteToken(dto.token)
    ? { ok: true, value: { token: dto.token } }
    : INVALID;
}

export function parsePeerVersionInput(
  value: unknown,
): Validation<{ peerId: SocialId; expectedVersion: number }> {
  const dto = record(value, ['peerId', 'expectedVersion']);
  return dto !== null && isSocialId(dto.peerId) && version(dto.expectedVersion)
    ? { ok: true, value: { peerId: dto.peerId, expectedVersion: dto.expectedVersion } }
    : INVALID;
}

export function parseBlockInput(
  value: unknown,
): Validation<{ peerId: SocialId; blocked: boolean; expectedVersion?: number }> {
  const dto = record(value, ['peerId', 'blocked', 'expectedVersion']);
  if (
    dto === null ||
    !isSocialId(dto.peerId) ||
    typeof dto.blocked !== 'boolean' ||
    (dto.expectedVersion !== undefined && !version(dto.expectedVersion)) ||
    (!dto.blocked && !version(dto.expectedVersion))
  ) {
    return INVALID;
  }
  return {
    ok: true,
    value: {
      peerId: dto.peerId,
      blocked: dto.blocked,
      ...(dto.expectedVersion === undefined ? {} : { expectedVersion: dto.expectedVersion }),
    },
  };
}

export function parsePostIdsInput(value: unknown): Validation<{ ids: readonly SocialId[] }> {
  const dto = record(value, ['ids']);
  if (
    dto === null ||
    !Array.isArray(dto.ids) ||
    dto.ids.length > 50 ||
    !dto.ids.every(isSocialId) ||
    new Set(dto.ids).size !== dto.ids.length
  ) {
    return INVALID;
  }
  return { ok: true, value: { ids: dto.ids } };
}

export function parsePostIdInput(value: unknown): Validation<{ id: SocialId }> {
  const dto = record(value, ['id']);
  return dto !== null && isSocialId(dto.id) ? { ok: true, value: { id: dto.id } } : INVALID;
}

export function parseReactionInput(
  value: unknown,
): Validation<{ postId: SocialId; active: boolean }> {
  const dto = record(value, ['postId', 'active']);
  return dto !== null && isSocialId(dto.postId) && typeof dto.active === 'boolean'
    ? { ok: true, value: { postId: dto.postId, active: dto.active } }
    : INVALID;
}
