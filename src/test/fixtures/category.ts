// 카테고리 픽스처 팩토리.
import type { Category } from '@/domain/category/category';
import { PALETTE } from '@/domain/theme/palette';

import { FIXTURE_INSTANT, fixtureId } from '@/test/fixtures/deps';

/** 한 건. 기본 색은 팔레트 첫 색(코랄)이고 `seq` 가 id·order·색을 함께 돌린다. */
export function makeCategory(overrides: Partial<Category> & { seq?: number } = {}): Category {
  const { seq = 1, ...rest } = overrides;
  return {
    id: fixtureId('category', seq),
    createdAt: FIXTURE_INSTANT,
    updatedAt: FIXTURE_INSTANT,
    rev: 1,
    name: `카테고리 ${seq}`,
    color: PALETTE[(seq - 1) % PALETTE.length].light,
    order: seq - 1,
    status: 'active',
    ...rest,
  };
}

/** `count` 개를 `order` 0..count-1 로. */
export function makeCategories(
  count: number,
  patch: (index: number) => Partial<Category> = () => ({}),
): Category[] {
  return Array.from({ length: count }, (_, index) =>
    makeCategory({ seq: index + 1, ...patch(index) }),
  );
}
