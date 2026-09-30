// 카테고리 쓰기 액션 묶음 훅. 액션은 스토어 생성 시 한 번 만들어지고 바뀌지 않는다.
import { useShallow } from 'zustand/react/shallow';

import {
  useCategoryStore,
  type CategoryActions,
  type CategoryStore,
} from '@/features/category/store/category-store';

/** 매 렌더 새 객체를 만들지만 필드가 전부 같은 참조라 `useShallow` 가 리렌더를 막는다. */
const selectActions = (state: CategoryStore): CategoryActions => ({
  confirmAudience: state.confirmAudience,
  load: state.load,
  createCategory: state.createCategory,
  updateCategory: state.updateCategory,
  setStatus: state.setStatus,
  reorder: state.reorder,
  moveBy: state.moveBy,
  clearError: state.clearError,
});

/**
 * 액션 전부가 필요한 컴포넌트(목록·메뉴·다이얼로그)를 위한 묶음.
 * 액션 하나만 쓰는 컴포넌트는 `useCategoryStore((s) => s.moveBy)` 처럼 그 조각만 구독하는 편이 싸다.
 */
export function useCategoryActions(): CategoryActions {
  return useCategoryStore(useShallow(selectActions));
}
