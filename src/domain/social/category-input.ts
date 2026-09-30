import {
  validateCategoryColor,
  validateCategoryEmoji,
  validateCategoryName,
} from '@/domain/category/category.rules';
import { isCategoryVisibility } from '@/domain/category/visibility';
import { isSocialId, type Validation } from '@/domain/social/input';
import type { SocialCategoryInput } from '@/domain/social/social';

const CONTROL = /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u2028-\u202e\u2066-\u2069]/u;
const INVALID: Validation<never> = { ok: false, code: 'validation' };

function record(value: unknown, keys: readonly string[]): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  return Object.keys(input).every((key) => keys.includes(key)) ? input : null;
}

/** 공개 category command는 개인/source/owner 필드를 받지 않는다. */
export function parseCategoryInput(value: unknown): Validation<SocialCategoryInput> {
  const input = record(value, ['id', 'expectedVersion', 'name', 'color', 'emoji', 'visibility']);
  if (
    input === null ||
    !Number.isSafeInteger(input.expectedVersion) ||
    Number(input.expectedVersion) < 0 ||
    !isCategoryVisibility(input.visibility)
  )
    return INVALID;
  if (input.id !== undefined && !isSocialId(input.id)) return INVALID;
  if (input.id === undefined && input.expectedVersion !== 0) return INVALID;
  if (
    typeof input.name !== 'string' ||
    typeof input.color !== 'string' ||
    (input.emoji !== undefined && typeof input.emoji !== 'string')
  )
    return INVALID;
  if (CONTROL.test(input.name) || (typeof input.emoji === 'string' && CONTROL.test(input.emoji)))
    return INVALID;
  try {
    const name = validateCategoryName(input.name, []);
    const color = validateCategoryColor(input.color);
    const emoji = validateCategoryEmoji(input.emoji as string | undefined);
    return {
      ok: true,
      value: {
        ...(input.id === undefined ? {} : { id: input.id as string }),
        expectedVersion: Number(input.expectedVersion),
        name,
        color,
        ...(emoji === undefined ? {} : { emoji }),
        visibility: input.visibility,
      },
    };
  } catch {
    return INVALID;
  }
}

/** 철회도 현재 canonical version을 확인한 소유자 명령이다. */
export function parseCategoryRevokeInput(
  value: unknown,
): Validation<{ id: string; expectedVersion: number }> {
  const input = record(value, ['id', 'expectedVersion']);
  if (
    input === null ||
    !isSocialId(input.id) ||
    !Number.isSafeInteger(input.expectedVersion) ||
    Number(input.expectedVersion) < 0
  )
    return INVALID;
  return { ok: true, value: { id: input.id, expectedVersion: Number(input.expectedVersion) } };
}
