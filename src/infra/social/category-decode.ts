import { isCategoryVisibility } from '@/domain/category/visibility';
import { isSocialId } from '@/domain/social/input';
import type { SocialCategoryView } from '@/domain/social/social';

import { SocialProtocolError } from '@/infra/social/protocol-error';

/** 신뢰하지 않는 응답은 원본/owner/계정 필드를 포함해 모두 거절한다. */
export function category(value: unknown): SocialCategoryView {
  return parseCategory(value, false);
}

/** 소유자 전용 정리 화면만 사본 수와 철회 상태를 받는다. */
export function ownerCategory(value: unknown): SocialCategoryView {
  return parseCategory(value, true);
}

function parseCategory(value: unknown, owner: boolean): SocialCategoryView {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new SocialProtocolError();
  const data = value as Record<string, unknown>;
  const keys = [
    'id',
    'name',
    'color',
    'emoji',
    'visibility',
    'version',
    'updatedAt',
    ...(owner ? ['postCount', 'revoked'] : []),
  ];
  if (
    Object.keys(data).some((key) => !keys.includes(key)) ||
    !isSocialId(data.id) ||
    typeof data.name !== 'string' ||
    typeof data.color !== 'string' ||
    !/^#[0-9A-F]{6}$/u.test(data.color) ||
    !isCategoryVisibility(data.visibility)
  )
    throw new SocialProtocolError();
  for (const key of ['version', 'updatedAt', 'postCount']) {
    if (key === 'postCount' && data[key] === undefined) continue;
    if (!Number.isSafeInteger(data[key]) || Number(data[key]) < 0) throw new SocialProtocolError();
  }
  if (data.revoked !== undefined && data.revoked !== true) throw new SocialProtocolError();
  if (data.emoji !== undefined && typeof data.emoji !== 'string') throw new SocialProtocolError();
  return {
    id: data.id,
    name: data.name,
    color: data.color,
    visibility: data.visibility,
    version: Number(data.version),
    updatedAt: Number(data.updatedAt),
    ...(data.revoked === true ? { revoked: true } : {}),
    ...(data.emoji === undefined ? {} : { emoji: data.emoji }),
    ...(data.postCount === undefined ? {} : { postCount: Number(data.postCount) }),
  };
}
