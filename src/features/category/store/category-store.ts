// 카테고리 스토어 (category.md R1~R9·R18~R20).
//
// 이 파일은 **조립만** 한다. 상태 모양과 순수 변환은 `category-state.ts`, 액션은 `category-actions.ts`,
// 저장·직렬화·롤백 배선은 `category-writes.ts`, 화면용 파생 값은 `category-selectors.ts` 다.
// 검증·정렬·재매김·시드는 전부 `@/domain/category/*` 의 순수 함수가 하고(복제 금지 — 복제하면
// memory·indexeddb·화면이 갈린다), 저장은 `@/repositories/container` 로 주입된 인터페이스로만 한다.
//
// 삭제 대화상자·되돌리기(R10~R16)의 액션은 `category-removal.ts` 에 있고 여기서 한 줄로 붙는다.
// **`CategoryActions` 에 합치지 않고 따로 둔다**: 합치면 그 타입을 필드 단위로 조립하는
// `useCategoryActions`(T-12a 소유)가 컴파일되지 않는다. 삭제 액션이 필요한 쪽은
// `CategoryRemovalActions` 를 따로 구독한다(`useCategoryRemoval`).
import { create } from 'zustand';

import type { MetaDeps } from '@/domain/meta';

import {
  createCategoryActions,
  type CategoryActions,
} from '@/features/category/store/category-actions';
import {
  createRemovalActions,
  type CategoryRemovalActions,
} from '@/features/category/store/category-removal';
import type { CategoryState } from '@/features/category/store/category-state';
import { createCategoryWriter } from '@/features/category/store/category-writes';

import { nowIso } from '@/lib/date';
import { newId } from '@/lib/id';

export type { CategoryActions, CategoryRemovalActions };

/** 상태 + 액션(생성·수정·정렬 + 삭제·되돌리기). 컴포넌트는 selector 로 필요한 조각만 구독한다. */
export type CategoryStore = CategoryState & CategoryActions & CategoryRemovalActions;

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
  return create<CategoryStore>()((set, get) => {
    const ctx = { set, get, deps };
    // 쓰기 큐 **하나**를 만들어 두 액션 묶음에 같이 넘긴다. 각자 만들면 생성 저장이 진행 중일 때
    // 시작된 삭제가 한 건 낡은 모집단으로 계획을 세운다(R2 이름 유일성·R5 order).
    const writer = createCategoryWriter(ctx);
    return {
      ...initialState,
      ...createCategoryActions(ctx, writer),
      ...createRemovalActions(ctx, writer),
    };
  });
}

/** 앱이 쓰는 단 하나의 카테고리 스토어. 컴포넌트는 selector 로 필요한 조각만 구독한다. */
export const useCategoryStore = createCategoryStore();
