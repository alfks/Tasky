import type { Category } from '@/domain/category/category';

export type CategoryVisibility = 'private' | 'friends' | 'public';

/** 허용되지 않은 범위를 넓은 범위로 보정하지 않는다. */
export function isCategoryVisibility(value: unknown): value is CategoryVisibility {
  return value === 'private' || value === 'friends' || value === 'public';
}

/** 오래된 개인 카테고리는 기본적으로 나만 보기다. */
export function categoryVisibility(category: Pick<Category, 'visibility'>): CategoryVisibility {
  return isCategoryVisibility(category.visibility) ? category.visibility : 'private';
}
