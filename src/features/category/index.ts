// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2).
// 명시 export 만 둔다.
//
// 삭제(R10~R16)는 **세 조각을 한 벌로** 내보낸다: `useCategoryRemoval()` 로 제어기를 만들어
// `CategoryList`/`CategoryClosedSection` 의 `onRemove` 에 `requestRemove` 를 넘기고, 같은 제어기를
// `<CategoryRemoveDialog controller=… />` 에 준다. 대화상자는 되돌리기 토스트 뷰포트까지 함께 그린다.
export { createCategoryStore, useCategoryStore } from '@/features/category/store/category-store';
export type {
  CategoryActions,
  CategoryRemovalActions,
  CategoryStore,
} from '@/features/category/store/category-store';
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
export { useCategoryRemoval } from '@/features/category/hooks/useCategoryRemoval';
export type {
  CategoryRemovalController,
  CategoryRemovalCounts,
} from '@/features/category/hooks/useCategoryRemoval';

export { CategoryFormDialog } from '@/features/category/components/CategoryFormDialog';
export { CategoryList } from '@/features/category/components/CategoryList';
export { CategoryListItem } from '@/features/category/components/CategoryListItem';
export { CategoryRemoveDialog } from '@/features/category/components/CategoryRemoveDialog';
