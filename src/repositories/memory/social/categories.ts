import { canReadCategory } from '@/domain/social/category-access';
import { parseCategoryInput, parseCategoryRevokeInput } from '@/domain/social/category-input';
import { canonicalCommandRequest } from '@/domain/social/idempotency';
import type { SocialCategoryInput, SocialCategoryView } from '@/domain/social/social';

import { keyPage } from '@/repositories/memory/social/cursor';
import { sha256 } from '@/repositories/memory/social/hash';
import {
  actor,
  answer,
  command,
  fail,
  nextId,
  type MemorySocialState,
} from '@/repositories/memory/social/model';
import { blockKey, isFriend, profileById } from '@/repositories/memory/social/relations';
import type { SocialRepository } from '@/repositories/social-repository';

/** owner의 정확한 사본 수는 다른 viewer에게 반환하지 않는다. */
export function categoryView(
  state: MemorySocialState,
  id: string,
  viewerId: string | null,
): SocialCategoryView {
  const category = state.categories.get(id);
  if (category === undefined) return fail('unavailable', state.now());
  const { ownerId, deleted, ...metadata } = category;
  return {
    ...metadata,
    ...(viewerId !== ownerId
      ? {}
      : {
          postCount: [...state.posts.values()].filter((post) => post.category?.id === id).length,
          ...(deleted ? { revoked: true } : {}),
        }),
  };
}

/** 철회 후에도 owner만 정리 목적으로 사본을 조회한다. */
export function categoryReadable(
  state: MemorySocialState,
  id: string,
  viewerId: string | null,
): boolean {
  const category = state.categories.get(id);
  if (category === undefined) return false;
  if (viewerId === category.ownerId && profileById(state, viewerId) !== undefined) return true;
  return canReadCategory({
    visibility: category.visibility,
    ownerId: category.ownerId,
    viewerId,
    ownerActive: profileById(state, category.ownerId) !== undefined,
    categoryActive: !category.deleted,
    viewerActive: viewerId === null || profileById(state, viewerId) !== undefined,
    friends: viewerId !== null && isFriend(state, viewerId, category.ownerId),
    blocked:
      viewerId !== null &&
      (state.blocks.has(blockKey(viewerId, category.ownerId)) ||
        state.blocks.has(blockKey(category.ownerId, viewerId))),
  });
}

function isPrivacyOnly(state: MemorySocialState, dto: SocialCategoryInput): boolean {
  const old = dto.id === undefined ? undefined : state.categories.get(dto.id);
  return (
    old !== undefined &&
    dto.visibility === 'private' &&
    dto.name === old.name &&
    dto.color === old.color &&
    dto.emoji === old.emoji
  );
}

function writeCategory(
  state: MemorySocialState,
  sub: string,
  dto: SocialCategoryInput,
): { id: string } {
  const self = actor(state, sub);
  const old = dto.id === undefined ? undefined : state.categories.get(dto.id);
  if (dto.id !== undefined && (old === undefined || old.ownerId !== self.id || old.deleted))
    return fail('unavailable', state.now());
  if (old !== undefined && old.version !== dto.expectedVersion)
    return fail('conflict', state.now());
  if (state.mode !== 'enabled' && !isPrivacyOnly(state, dto))
    return fail('social-disabled', state.now());
  if (
    old === undefined &&
    [...state.categories.values()].filter((item) => item.ownerId === self.id && !item.deleted)
      .length >= 50
  )
    return fail('limit-reached', state.now());
  const id = dto.id ?? nextId(state);
  state.categories.set(id, {
    id,
    name: dto.name,
    color: dto.color,
    ...(dto.emoji === undefined ? {} : { emoji: dto.emoji }),
    visibility: dto.visibility,
    version: (old?.version ?? 0) + 1,
    updatedAt: state.now(),
    ownerId: self.id,
    deleted: false,
  });
  return { id };
}

async function saveCategory(
  state: MemorySocialState,
  sub: string,
  input: SocialCategoryInput,
  key: string,
) {
  const parsed = parseCategoryInput(input);
  if (!parsed.ok) return fail('validation', state.now());
  const dto = parsed.value;
  const result = await command(
    state,
    sub,
    key,
    await sha256(canonicalCommandRequest('POST', '/api/social/categories', 1, dto)),
    () => writeCategory(state, sub, dto),
    { gate: isPrivacyOnly(state, dto) ? 'revoke' : 'write' },
  );
  const self = actor(state, sub);
  return answer(state, categoryView(state, result.data.id, self.id));
}

async function revokeCategory(
  state: MemorySocialState,
  sub: string,
  input: { id: string; expectedVersion: number },
  key: string,
) {
  const parsed = parseCategoryRevokeInput(input);
  if (!parsed.ok) return fail('validation', state.now());
  const dto = parsed.value;
  const result = await command(
    state,
    sub,
    key,
    await sha256(canonicalCommandRequest('POST', '/api/social/categories/revoke', 1, dto)),
    () => {
      const self = actor(state, sub);
      const old = state.categories.get(dto.id);
      if (old === undefined || old.ownerId !== self.id) return fail('unavailable', state.now());
      if (old.version !== dto.expectedVersion) return fail('conflict', state.now());
      state.categories.set(old.id, {
        ...old,
        visibility: 'private',
        deleted: true,
        version: old.version + 1,
        updatedAt: state.now(),
      });
      return { id: old.id };
    },
    { gate: 'revoke' },
  );
  const self = actor(state, sub);
  return answer(state, categoryView(state, result.data.id, self.id));
}

/** 소유권/CAS/멱등 포트는 replay에도 canonical 자료를 다시 읽는다. */
export function categoryMethods(
  state: MemorySocialState,
  sub: string,
): Pick<SocialRepository, 'categories' | 'category' | 'saveCategory' | 'revokeCategory'> {
  return {
    categories: async (input) => {
      const self = actor(state, sub);
      const items = [...state.categories.values()]
        .filter((category) => category.ownerId === self.id)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map((category) => categoryView(state, category.id, self.id));
      return answer(
        state,
        keyPage(state, self.id, 'categories:mine', items, input, (item) => item.id),
      );
    },
    category: async ({ id }) => {
      const self = actor(state, sub);
      if (!categoryReadable(state, id, self.id)) return fail('unavailable', state.now());
      if (state.categories.get(id)?.ownerId !== self.id && state.mode === 'off')
        return fail('social-disabled', state.now());
      return answer(state, categoryView(state, id, self.id));
    },
    saveCategory: (input, { key }) => saveCategory(state, sub, input, key),
    revokeCategory: (input, { key }) => revokeCategory(state, sub, input, key),
  };
}
