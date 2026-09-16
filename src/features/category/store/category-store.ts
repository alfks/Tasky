// 카테고리 스토어 (category.md R1~R9·R18~R20).
//
// 이 파일은 **조립만** 한다. 상태 모양과 순수 변환은 `category-state.ts`, 액션은 `category-actions.ts`,
// 저장·직렬화·롤백 배선은 `category-writes.ts`, 화면용 파생 값은 `category-selectors.ts` 다.
// 검증·정렬·재매김·시드는 전부 `@/domain/category/*` 의 순수 함수가 하고(복제 금지 — 복제하면
// memory·indexeddb·화면이 갈린다), 저장은 `@/repositories/container` 로 주입된 인터페이스로만 한다.
//
// **T-12b(삭제 대화상자·되돌리기)가 이어받는 파일이다.** 삭제 액션은 여기서 스프레드 한 줄로 더한다:
// `...createRemovalActions({ set, get, deps })` — 그 액션들이 쓸 것은 이미 열려 있다(고칠 파일 없음).
// `CategoryWriter.applyWrites`(단일 트랜잭션 + 맵 반영), `CategoryState.pendingRemoval`(6초 창의
// 삭제 직전 값), `withCategories`(툼스톤은 맵에서 내린다). 자세한 것은 핸드오프 문서.
import { create } from 'zustand';

import type { MetaDeps } from '@/domain/meta';

import {
  createCategoryActions,
  type CategoryActions,
} from '@/features/category/store/category-actions';
import type { CategoryState } from '@/features/category/store/category-state';

import { nowIso } from '@/lib/date';
import { newId } from '@/lib/id';

export type { CategoryActions };

/** 상태 + 액션. 컴포넌트는 selector 로 필요한 조각만 구독한다. */
export type CategoryStore = CategoryState & CategoryActions;

/** 아직 아무것도 읽지 않은 상태. */
const initialState: CategoryState = {
  byId: {},
  status: 'idle',
  error: null,
  pendingRemoval: null,
};

/** 실제 시계·UUID. 테스트는 `createCategoryStore(fixedDeps())` 로 결정적인 주입기를 쓴다. */
const defaultDeps: MetaDeps = { now: nowIso, id: newId };

/**
 * 스토어 팩토리. 앱은 아래 `useCategoryStore` 하나만 쓰고(code-style §4: feature 당 스토어 1개),
 * 테스트가 결정적인 `deps` 로 격리된 인스턴스를 만들 수 있도록 팩토리를 열어 둔다.
 */
export function createCategoryStore(deps: MetaDeps = defaultDeps) {
  return create<CategoryStore>()((set, get) => ({
    ...initialState,
    ...createCategoryActions({ set, get, deps }),
  }));
}

/** 앱이 쓰는 단 하나의 카테고리 스토어. 컴포넌트는 selector 로 필요한 조각만 구독한다. */
export const useCategoryStore = createCategoryStore();
