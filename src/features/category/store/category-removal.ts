// 카테고리 삭제(category R13·R14)와 되돌리기(R15)의 **액션**. 무엇을 쓸지는 전부 도메인이 정한다 —
// `planCategoryRemoval` / `planCategoryRemovalUndo` 를 부르기만 하고 여기서 계획을 다시 만들지 않는다
// (복제하면 memory·indexeddb 계약 테스트가 지키는 규칙과 화면이 갈린다).
//
// **이 파일이 지키는 것**
//  · 삭제 + 미완료 처리 + 즉석 생성은 `CategoryWriter.applyWrites` 한 번 = `dataset.write` 한 번(R13).
//  · `pendingRemoval`(6초 창의 삭제 직전 값)은 **쓰기가 성공한 뒤에만** 채운다. 실패했으면 아무것도
//    바뀌지 않았으므로 되돌릴 것도 없다(R13 "중간 실패 시 아무것도 바뀌지 않음").
//  · 되돌리기는 **슬롯 하나**다. 삭제가 또 일어나면 앞의 메모는 덮이고, 그 순간 앞의 토스트도
//    같이 내려야 한다(그 책임은 `useCategoryRemoval` — 화면에 보이는 [되돌리기] 는 항상 이 슬롯과 짝이다).
//  · 새로고침하면 메모는 사라진다. 소프트 삭제된 값은 엔티티 조회로 다시 읽히지 않으므로(ADR-0007 결정 4)
//    되돌리기 창은 **그 세션 안에서만** 유효하다 — 스펙의 "스토어가 6초 창 동안 메모리에 들고 있는다"(R15).
//
// **쓰기 큐는 생성·수정 액션과 하나를 공유한다**: writer 를 여기서 만들지 않고 스토어에서 주입받는다.
// 각자 만들던 시절에는 두 갈래 큐가 서로의 결과를 보지 못해, 생성이 저장 중인 **바로 그 사이에**
// 삭제를 실행하면 `categories` 모집단이 한 건 낡은 채로 계획이 섰다(R2 이름 유일성·R5 order —
// ② 즉석 생성이 방금 만들어진 카테고리와 같은 이름·같은 order 를 발급할 수 있었다).
// 투두 스토어가 같은 유형의 경쟁으로 `orders=[0,0]` 을 냈던 전례가 있고, 그때도 한 줄 큐가 답이었다.
import type { Category } from '@/domain/category/category';
import {
  planCategoryRemoval,
  planCategoryRemovalUndo,
  type CategoryRemovalChoice,
} from '@/domain/category/removal';
import type { DatasetWrite } from '@/domain/dataset';

import { getRepositories } from '@/repositories/container';

import type { CategoryRemovalMemo } from '@/features/category/store/category-state';
import type { CategoryContext, CategoryWriter } from '@/features/category/store/category-writes';

/** 삭제·되돌리기 액션. 스토어는 이 결과를 상태에 펼쳐 넣기만 한다. */
export type CategoryRemovalActions = {
  /**
   * 카테고리 삭제 (R13·R14). 성공하면 `pendingRemoval` 이 채워지고 호출자가 되돌리기 토스트를 띄운다.
   * 실패하면 `false` + `error` 에 문구가 남고 **저장소는 그대로다**(단일 트랜잭션).
   */
  removeCategory: (input: {
    category: Category;
    choice: CategoryRemovalChoice;
  }) => Promise<boolean>;
  /**
   * 되돌리기 (R15). `pendingRemoval` 이 없으면 `false` + `error` 는 그대로(되돌릴 것이 없는 것은 실패가 아니다).
   * 실행 직전에 슬롯을 비워 **두 번 눌러도 두 번 되감기지 않게** 하고, 쓰기가 실패하면 슬롯을 되돌려 놓는다.
   */
  undoRemoval: () => Promise<boolean>;
  /** 되돌리기 창이 닫혔을 때(6초 경과·토스트 닫음). 메모를 버린다. */
  clearPendingRemoval: () => void;
};

/** ② 로 즉석 생성된 카테고리를 writes 에서 집어 낸다 — 되돌리기가 이것을 소프트 삭제한다(R15). */
function createdIn(
  writes: readonly DatasetWrite[],
  createdCategoryId: string | undefined,
): Category | undefined {
  if (createdCategoryId === undefined) {
    return undefined;
  }
  for (const write of writes) {
    if (write.table === 'categories' && write.entity.id === createdCategoryId) {
      return write.entity;
    }
  }
  return undefined;
}

/** 삭제 계획 한 번. `build` 차례가 왔을 때 실행되므로 여기서 읽는 스냅샷이 가장 최신이다. */
async function planRemoval(
  ctx: CategoryContext,
  category: Category,
  choice: CategoryRemovalChoice,
  box: { memo?: CategoryRemovalMemo },
): Promise<DatasetWrite[]> {
  const repositories = getRepositories();
  const todos = await repositories.todos.listByCategory(category.id);
  // ① 만 대상 그룹의 현재 투두가 필요하다(R14-a 의 날짜별 시작값). ②는 방금 만든 빈 카테고리, ③은 이동이 없다.
  const targetTodos =
    choice.incomplete === 'move' ? await repositories.todos.listByCategory(choice.targetId) : [];
  const { writes, result } = planCategoryRemoval({
    category,
    todos,
    targetTodos,
    choice,
    deps: ctx.deps,
    // 삭제 시점의 전량(삭제 대상 자신 포함) — R5 order·R12 이름 유일성·개수의 모집단이다.
    categories: Object.values(ctx.get().byId),
  });
  const createdCategory = createdIn(writes, result.createdCategoryId);
  box.memo = {
    result,
    category,
    // 삭제 **직전** 값 그대로. 완료 투두도 들어 있지만 되돌리기는 `result` 에 실린 것만 되감는다.
    todos,
    ...(createdCategory === undefined ? {} : { createdCategory }),
  };
  return writes;
}

/** 삭제·되돌리기 액션 묶음. 스토어 하나마다 한 번 만들고, `writer` 는 생성·수정 액션과 **같은 것**이다. */
export function createRemovalActions(
  ctx: CategoryContext,
  writer: CategoryWriter,
): CategoryRemovalActions {
  return {
    removeCategory: async ({ category, choice }) => {
      const box: { memo?: CategoryRemovalMemo } = {};
      const saved = await writer.applyWrites(() => planRemoval(ctx, category, choice, box));
      const memo = box.memo;
      if (!saved || memo === undefined) {
        return false;
      }
      ctx.set({ pendingRemoval: memo });
      return true;
    },

    undoRemoval: async () => {
      const memo = ctx.get().pendingRemoval;
      if (memo === null) {
        return false;
      }
      ctx.set({ pendingRemoval: null });
      const undone = await writer.applyWrites(
        () => planCategoryRemovalUndo({ ...memo, deps: ctx.deps }).writes,
      );
      if (!undone) {
        // 저장이 실패했으면 삭제 결과가 그대로 남아 있다 — 다시 누를 수 있게 슬롯을 복구한다.
        ctx.set({ pendingRemoval: memo });
      }
      return undone;
    },

    clearPendingRemoval: () => {
      ctx.set({ pendingRemoval: null });
    },
  };
}
