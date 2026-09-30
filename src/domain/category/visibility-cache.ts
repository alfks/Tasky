import type { Category } from '@/domain/category/category';
import { isCategoryVisibility, type CategoryVisibility } from '@/domain/category/visibility';
import { touch, type MetaDeps, type Persistable } from '@/domain/meta';

/** 서버에서 확인한 결과만 개인 연결 표식에 기록한다. 권한 판정은 서버의 현재 버전이다. */
export function confirmCategoryVisibility(
  category: Category,
  confirmed: { id: string; visibility: CategoryVisibility; version: number },
  deps: MetaDeps,
): Persistable<Category> {
  if (!isCategoryVisibility(confirmed.visibility) || !/^[0-9a-f]{32}$/u.test(confirmed.id)) {
    throw new Error('확인된 공개범위 형식이 올바르지 않습니다.');
  }
  if (!Number.isSafeInteger(confirmed.version) || confirmed.version < 0) {
    throw new Error('확인된 공개범위 버전이 올바르지 않습니다.');
  }
  return touch(
    {
      ...category,
      visibility: confirmed.visibility,
      socialCategoryId: confirmed.id,
      socialCategoryVersion: confirmed.version,
    },
    deps.now(),
  );
}

/** 유효하지 않은 복원 연결을 버려도 서버의 공개 상태를 바꾸지는 않는다. */
export function clearCategoryVisibility(category: Category, deps: MetaDeps): Persistable<Category> {
  const { socialCategoryId: _id, socialCategoryVersion: _version, ...rest } = category;
  return touch({ ...rest, visibility: 'private' }, deps.now());
}
