/** 테스트 fake의 actor·scope 결합 keyset cursor. 원문 payload는 서버 내부 Map에만 둔다. */
import type { Page, PageInput, SocialId } from '@/domain/social/social';

import { randomHex } from '@/repositories/memory/social/hash';
import { fail, type MemorySocialState } from '@/repositories/memory/social/model';

const CURSOR_MS = 15 * 60 * 1000;

export function keyPage<T>(
  state: MemorySocialState,
  actorId: SocialId,
  scope: string,
  items: readonly T[],
  input: PageInput | undefined,
  keyOf: (item: T) => string,
  order: 'asc' | 'desc' = 'asc',
): Page<T> {
  const limit = input?.limit ?? 20;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) {
    return fail('validation', state.now());
  }
  const prior = input?.cursor === undefined ? null : (state.cursors.get(input.cursor) ?? null);
  if (
    input?.cursor !== undefined &&
    (prior === null ||
      prior.actorId !== actorId ||
      prior.scope !== scope ||
      prior.expiresAt <= state.now())
  ) {
    return fail('validation', state.now());
  }
  const upper = prior?.upper ?? (order === 'desc' && items.length > 0 ? keyOf(items[0]) : null);
  const eligible = items.filter((item) => {
    const key = keyOf(item);
    return (
      (upper === null || key <= upper) &&
      (prior === null || (order === 'asc' ? key > prior.last : key < prior.last))
    );
  });
  const slice = eligible.slice(0, limit);
  if (eligible.length <= limit) return { items: slice, nextCursor: null };
  const nextCursor = randomHex(16);
  state.cursors.set(nextCursor, {
    actorId,
    scope,
    last: keyOf(slice[slice.length - 1]),
    upper,
    expiresAt: prior?.expiresAt ?? state.now() + CURSOR_MS,
  });
  return { items: slice, nextCursor };
}
