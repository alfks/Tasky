// 카테고리 스토어의 **상태 모양과 순수 변환** — React·zustand·레포지토리를 모르는 부분만 모았다.
// 액션(언제 저장하고 무엇을 되돌리는가)은 `category-actions.ts`, 저장 배선은 `category-writes.ts`,
// 화면용 파생 값은 `category-selectors.ts`.
import type { Category } from '@/domain/category/category';
import type { CategoryRemovalResult } from '@/domain/category/removal';
import { DomainError } from '@/domain/errors';
import type { CategoryId } from '@/domain/ids';
import { isTombstone } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

/** id → 카테고리. 쓰기가 없으면 참조가 그대로라 이 조각만 구독한 훅은 다시 계산하지 않는다. */
export type CategoryMap = Readonly<Record<string, Category>>;

/** 선택자가 보는 최소 상태. 스토어 전체를 구독하지 않도록 `byId` 하나만 요구한다. */
export type CategorySnapshot = { readonly byId: CategoryMap };

/** 목록 적재 상태. `error` 는 적재 실패와 쓰기 실패가 함께 쓴다. */
export type CategoryLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * 되돌리기 6초 창 동안 메모리에 드는 **삭제 직전 값** (category R15) — 소프트 삭제된 뒤라
 * 엔티티 조회로는 다시 읽히지 않는다(ADR-0007 결정 4). 필드 구성은 `planCategoryRemovalUndo` 의
 * 입력과 1:1 이라 그대로 넘길 수 있다.
 *
 * **T-12a 는 이 값을 채우지 않는다** — 삭제 실행(R13~R15)은 T-12b 소관이고, 여기서는 상태 모양만
 * 열어 둔다. 이 필드가 없으면 T-12b 가 `CategoryState`(T-12a 소유)를 고쳐야 해서 락이 충돌한다.
 */
export type CategoryRemovalMemo = {
  result: CategoryRemovalResult;
  /** 삭제 직전의 카테고리. */
  category: Category;
  /** 삭제 직전의 투두(옮겨졌거나 함께 지워진 것 전부). */
  todos: readonly Todo[];
  /** ② 즉석 생성된 카테고리(있을 때만). 되돌리기가 이것을 소프트 삭제한다. */
  createdCategory?: Category;
};

/** 스토어의 상태 부분. */
export type CategoryState = CategorySnapshot & {
  status: CategoryLoadStatus;
  /** 사용자에게 그대로 보여줄 한국어 문구. 성공한 액션은 `null` 로 지운다. */
  error: string | null;
  /** 되돌리기 창이 열려 있는 동안의 삭제 직전 값 (R15, T-12b 가 채운다). */
  pendingRemoval: CategoryRemovalMemo | null;
};

/** 쓰기 실패 공통 문구 (category §2-D). 원인이 아니라 다음 행동을 안내한다. */
export const SAVE_FAILED = '저장하지 못했어요. 다시 시도해 주세요';

/** 도메인 규칙 위반은 그 문구를 그대로, 그 밖의 실패는 공통 문구를 쓴다 (category §2-D). */
export function messageOf(error: unknown): string {
  return error instanceof DomainError ? error.message : SAVE_FAILED;
}

/** 조회 결과를 상태 맵으로. */
export function indexCategories(categories: readonly Category[]): CategoryMap {
  return Object.fromEntries(categories.map((category) => [category.id, category]));
}

/**
 * 주어진 카테고리들을 덮어쓴 새 맵. **툼스톤은 덮어쓰지 않고 내린다** — 스토어의 맵은 조회 API 와
 * 같은 약속(툼스톤 없음)을 지켜야 선택자가 다시 거르지 않는다(ADR-0007 결정 4·5).
 * 삭제 트랜잭션의 결과를 그대로 반영하는 경로이기도 하다(T-12b).
 */
export function withCategories(byId: CategoryMap, categories: readonly Category[]): CategoryMap {
  const next: Record<string, Category> = { ...byId };
  for (const category of categories) {
    if (isTombstone(category)) {
      delete next[category.id];
    } else {
      next[category.id] = category;
    }
  }
  return next;
}

/** 한 건을 뺀 새 맵. */
export function withoutCategory(byId: CategoryMap, id: CategoryId): CategoryMap {
  const { [id]: _removed, ...rest } = byId;
  return rest;
}
