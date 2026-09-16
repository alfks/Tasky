// 스토어 상태 → 화면이 그대로 쓰는 파생 값 (category.md R5·R8·R9). 순수 함수라 React 없이 단위 테스트한다.
//
// 정렬 규칙은 하나도 여기서 만들지 않는다 — 활성 목록은 `activeCategories`(R5), 종료 목록은
// `closedCategories`(R8 `closedAt` 내림차순), 전체 표시 순서는 `sortCategoriesForDisplay`(todo R15 ·
// completion-rate R5 와 **같은 함수**)를 부른다. 규칙을 복제하면 사이드바와 본문 그룹이 조용히 갈린다.
//
// 반환값은 매번 새 배열이다. 훅은 참조가 안정적인 `byId` 만 구독하고 렌더 중에 이 함수를 부른다
// (code-style §3 "파생 값은 렌더 중 계산").
import type { Category } from '@/domain/category/category';
import {
  activeCategories,
  closedCategories,
  sortCategoriesForDisplay,
} from '@/domain/category/category.rules';
import type { CategoryId } from '@/domain/ids';

import type { CategorySnapshot } from '@/features/category/store/category-state';

/**
 * 본문 그룹·달성률이 받는 전체 목록: 활성(`order`) → 종료(`closedAt` 내림차순).
 * 스토어 맵에는 툼스톤이 없으므로 "삭제됨" 그룹(R17)은 여기 들어오지 않는다 — 그 경로는
 * `DatasetRepository.readAll()` 이며 T-15 가 따로 읽는다.
 */
export function selectCategories(state: CategorySnapshot): Category[] {
  return sortCategoriesForDisplay(Object.values(state.byId));
}

/** 사이드바 본 목록 (R5). 새 투두 대상·이동 대상도 이 목록이다 (R8). */
export function selectActiveCategories(state: CategorySnapshot): Category[] {
  return activeCategories(Object.values(state.byId));
}

/** "종료됨 (n)" 접힘 섹션 (R8). 완료·중단을 함께 담고 `closedAt` 내림차순이다. */
export function selectClosedCategories(state: CategorySnapshot): Category[] {
  return closedCategories(Object.values(state.byId));
}

/** 한 건. 수정 다이얼로그·메뉴가 대상 카테고리를 집을 때 쓴다. */
export function selectCategoryById(state: CategorySnapshot, id: CategoryId): Category | undefined {
  return state.byId[id];
}
