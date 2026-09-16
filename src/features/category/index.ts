// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2).
// 명시 export 만 둔다. 삭제 대화상자·되돌리기(category R10~R16)는 T-12b 가 여기에 더한다
// (TECH_PLAN §3 공유 파일 표: `store/category-store.ts` 와 이 파일이 T-12a → T-12b 로 넘어간다).
export { createCategoryStore, useCategoryStore } from '@/features/category/store/category-store';
export type { CategoryActions, CategoryStore } from '@/features/category/store/category-store';
export type {
  CategoryLoadStatus,
  CategoryMap,
  CategoryRemovalMemo,
  CategorySnapshot,
  CategoryState,
} from '@/features/category/store/category-state';

export {
  selectActiveCategories,
  selectCategories,
  selectCategoryById,
  selectClosedCategories,
} from '@/features/category/store/category-selectors';

export {
  useActiveCategories,
  useCategories,
  useCategoryById,
  useCategoryLoadState,
  useClosedCategories,
} from '@/features/category/hooks/useCategories';
export type { CategoryLoadState } from '@/features/category/hooks/useCategories';
export { useCategoryActions } from '@/features/category/hooks/useCategoryActions';
export type { CategoryFormMode } from '@/features/category/hooks/useCategoryForm';

export { CategoryFormDialog } from '@/features/category/components/CategoryFormDialog';
export { CategoryList } from '@/features/category/components/CategoryList';
export { CategoryListItem } from '@/features/category/components/CategoryListItem';
