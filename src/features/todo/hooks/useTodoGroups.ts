// 카테고리 그룹 파생 훅 (todo.md R7·R15). 스토어에서 참조가 안정적인 `byId` 만 구독하고 배치는 렌더 중에 계산한다.
import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';

import { selectGroup, selectGroups, type TodoGroup } from '@/features/todo/store/todo-selectors';
import { useTodoStore } from '@/features/todo/store/todo-store';

/**
 * 화면에 그릴 그룹 목록 (R15 순서, R7 배치). `categories` 는 카테고리 feature 가 준다 —
 * 이 훅은 카테고리 스토어를 구독하지 않는다(feature 간 결합을 호출부 한 곳에 모아 둔다).
 */
export function useTodoGroups(categories: readonly Category[]): TodoGroup[] {
  const byId = useTodoStore((state) => state.byId);
  return selectGroups({ byId }, categories);
}

/** 한 그룹만 필요할 때 (그룹 컴포넌트가 자기 카테고리만 구독). */
export function useTodoGroup(categoryId: CategoryId): TodoGroup {
  const byId = useTodoStore((state) => state.byId);
  return selectGroup({ byId }, categoryId);
}
