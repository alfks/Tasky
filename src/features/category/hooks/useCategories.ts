// 카테고리 파생 훅 (category.md R5·R8). 스토어에서 참조가 안정적인 `byId` 만 구독하고 배치는 렌더 중에 계산한다.
import { useShallow } from 'zustand/react/shallow';

import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';

import {
  selectActiveCategories,
  selectCategories,
  selectCategoryById,
  selectClosedCategories,
} from '@/features/category/store/category-selectors';
import type { CategoryLoadStatus } from '@/features/category/store/category-state';
import { useCategoryStore, type CategoryStore } from '@/features/category/store/category-store';

/** 본문 그룹·달성률에 넘길 전체 목록(활성 → 종료). `useTodoGroups(categories)` 의 인자가 이것이다. */
export function useCategories(): Category[] {
  const byId = useCategoryStore((state) => state.byId);
  return selectCategories({ byId });
}

/** 사이드바 본 목록 (R5). */
export function useActiveCategories(): Category[] {
  const byId = useCategoryStore((state) => state.byId);
  return selectActiveCategories({ byId });
}

/** "종료됨 (n)" 섹션 (R8). */
export function useClosedCategories(): Category[] {
  const byId = useCategoryStore((state) => state.byId);
  return selectClosedCategories({ byId });
}

/** 한 건. 수정 다이얼로그가 대상 카테고리를 집을 때 쓴다. */
export function useCategoryById(id: CategoryId): Category | undefined {
  const byId = useCategoryStore((state) => state.byId);
  return selectCategoryById({ byId }, id);
}

/** 적재 상태 + 오류 문구 (§2-D 로딩·에러). */
export type CategoryLoadState = { status: CategoryLoadStatus; error: string | null };

const selectLoadState = (state: CategoryStore): CategoryLoadState => ({
  status: state.status,
  error: state.error,
});

/** 스켈레톤·오류 문구를 그리는 컴포넌트가 쓴다. 두 값이 그대로일 때는 리렌더하지 않는다. */
export function useCategoryLoadState(): CategoryLoadState {
  return useCategoryStore(useShallow(selectLoadState));
}
