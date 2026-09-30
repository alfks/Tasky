// 카테고리 스토어의 액션 (category.md R1~R9·R18~R20). 저장 배선은 `category-writes.ts` 가 맡는다.
//
// **낙관적 갱신을 쓰는 액션과 쓰지 않는 액션**:
// - `reorder`·`moveBy` 는 손이 움직인 자리(드래그·`Alt+↑/↓`)에 결과가 바로 보여야 해서 낙관적이다.
//   실패하면 건드린 카테고리만 이전 값으로 되돌린다.
// - `createCategory`·`updateCategory`·`setStatus` 는 저장이 끝난 뒤 반영한다. 셋 다 다이얼로그·메뉴를
//   거쳐 이미 한 박자가 있고, 낙관적으로 넣었다가 되돌리면 방금 만든 행이 사라지는 편이 더 놀랍다.
//
// **쓰기 액션의 `false` 두 가지를 `error` 로 가른다**: `false` + `error !== null` 은 검증·저장 실패,
// `false` + `error === null` 은 대상이 없는 것(이미 사라진 카테고리·목록 끝에서의 `moveBy` — 다시 시도할 것이 없다).
import type { Category, CategoryStatus } from '@/domain/category/category';
import {
  activeCategories,
  createCategory as createCategoryRule,
  planFirstRunSeed,
  reorderCategories,
  transitionCategory,
  updateCategory as updateCategoryRule,
} from '@/domain/category/category.rules';
import type { CategoryVisibility } from '@/domain/category/visibility';
import type { CategoryId } from '@/domain/ids';
import { createSettings } from '@/domain/theme/settings.rules';

import { getRepositories } from '@/repositories/container';

import { indexCategories, messageOf } from '@/features/category/store/category-state';
import type { CategoryContext, CategoryWriter } from '@/features/category/store/category-writes';

/** 스토어의 액션 부분. 쓰기 액션은 성공 여부를 돌려준다 — 다이얼로그가 닫을지 판단한다. */
export type CategoryActions = {
  /** 서버에서 확인한 연결만 최신 개인 카테고리에 기록한다. */
  confirmAudience: (
    id: CategoryId,
    canonical: { id: string; visibility: CategoryVisibility; version: number } | null,
    allowed?: () => boolean,
  ) => Promise<boolean>;
  /**
   * 카테고리 전량(활성 + 종료, 툼스톤 제외)을 읽어 메모리를 교체하고, 첫 실행이면 시드한다 (R18).
   * 종료된 것까지 들고 있는 이유: "종료됨 (n)" 섹션(R8)과 이름 유일성·개수 제한의 모집단(R2·R6)이
   * 종료를 포함하기 때문이다.
   */
  load: () => Promise<void>;
  /** 새 카테고리 (R1~R6). `order` 는 활성 목록 끝이고 상태는 `active` 로 시작한다. */
  createCategory: (input: { name: string; color: string; emoji?: string }) => Promise<boolean>;
  /** 이름·색·이모지 수정 (§2-B 수정 모드). `emoji: null` 은 이모지 제거. 색은 즉시 반영된다(R20). */
  updateCategory: (
    id: CategoryId,
    patch: { name?: string; color?: string; emoji?: string | null },
  ) => Promise<boolean>;
  /**
   * 상태 전이 (R7·R9): 완료로 종료 · 중단으로 종료 · 재개 · 상태 바꾸기가 전부 이 하나다.
   * 같은 상태로의 전이는 도메인이 막는다(자동 전이 없음).
   */
  setStatus: (id: CategoryId, status: CategoryStatus) => Promise<boolean>;
  /** 활성 목록 안에서 `targetIndex` 자리로 (R5). 활성 목록이 0..n-1 로 재매김된다. */
  reorder: (id: CategoryId, targetIndex: number) => Promise<boolean>;
  /** `Alt+↑/↓`·메뉴 "위로/아래로" (R5). 목록 끝에서는 아무것도 하지 않고 `false`(오류 아님). */
  moveBy: (id: CategoryId, direction: -1 | 1) => Promise<boolean>;
  /** 토스트·인라인 오류를 닫을 때 문구를 지운다. */
  clearError: () => void;
};

/** 적재 + 첫 실행 시드 (R18). 요청 번호로 늦게 도착한 이전 요청의 응답을 버린다. */
function createLoadAction(
  ctx: CategoryContext,
  writer: CategoryWriter,
): Pick<CategoryActions, 'load'> {
  /**
   * 카테고리가 하나도 없을 때만 부른다. 시드 여부의 최종 판정은 도메인 `planFirstRunSeed` 가 하고
   * (`seededAt` 이 있으면 `undefined`), 카테고리 + 설정 두 로우는 **한 트랜잭션**으로 쓴다.
   * 설정 행이 아직 없으면 도메인 기본값을 만들어 같은 쓰기에 실어 보낸다(레포지토리는 값을 만들지 않는다).
   */
  const seed = async (): Promise<void> => {
    const stored = await getRepositories().settings.get();
    const settings = stored ?? createSettings(ctx.deps);
    await writer.applyWrites(() => {
      const plan = planFirstRunSeed(Object.values(ctx.get().byId), settings, ctx.deps);
      if (plan === undefined) {
        return [];
      }
      return [
        { table: 'categories', entity: plan.category },
        { table: 'settings', entity: plan.settings },
      ];
    });
  };

  let loadSeq = 0;
  return {
    load: async () => {
      const seq = (loadSeq += 1);
      ctx.set({ status: 'loading', error: null });
      try {
        const categories = await getRepositories().categories.list({ includeClosed: true });
        if (seq !== loadSeq) {
          return;
        }
        // `status` 는 아직 'loading' 으로 둔다 — 첫 실행 시드(R18)가 있으면 그것까지 끝나야
        // "적재가 끝났다" 이기 때문이다. 여기서 바로 'ready' 로 올리면 화면이 잠깐 빈 상태
        // ("아직 카테고리가 없어요" + [첫 카테고리 만들기])로 떴다가 시드가 끼어들며 바뀌는
        // 깜빡임이 생기고, 그 창에서 사용자가 직접 만들면 시드분과 합쳐져 개수가 예상과 어긋난다
        // (실측: 시드 앞에 지연을 인위로 주면 "핵심 흐름" e2e 의 사이드바 카테고리 개수 단언이
        // 기대 1개·실제 2개로 결정적으로 깨졌다 — 이 재배열로 고정됨).
        ctx.set({ byId: indexCategories(categories) });
        if (categories.length === 0) {
          // 시드가 매달리면(예: IndexedDB 가 blocked 상태로 멈춤) 셸 전체가 로딩(스켈레톤)에
          // 머문다 — 이전에는 'ready' 를 먼저 찍어 최소한 빈 목록은 보였다. 저장소 쓰기가
          // 영영 끝나지 않는 경우는 이 구현에서 재현하기 어렵고(리뷰 실측), 여기서 막지는
          // 않는다 — 그런 경우가 생기면 타임아웃/재시도는 별도 티켓으로 다룬다.
          await seed();
        }
        // 시드가 끝난 뒤에도 여전히 이 호출이 최신이어야 'ready' 로 올린다 — 시드가 도는 동안
        // 새 load() 가 시작됐다면 그쪽 결과를 덮어쓰지 않는다.
        if (seq === loadSeq) {
          ctx.set({ status: 'ready' });
        }
      } catch (error) {
        if (seq === loadSeq) {
          ctx.set({ status: 'error', error: messageOf(error) });
        }
      }
    },
  };
}

/** 생성·수정·상태 전이 (R1~R7·R9·R20). 셋 다 저장이 끝난 뒤 반영한다. */
function createEntryActions(
  ctx: CategoryContext,
  writer: CategoryWriter,
): Pick<CategoryActions, 'createCategory' | 'updateCategory' | 'setStatus'> {
  /** 이름 유일성(R2)·개수 제한(R6)·재개 순서(R9)의 모집단 = 메모리의 카테고리 전량(종료 포함). */
  const existing = (): Category[] => Object.values(ctx.get().byId);

  return {
    createCategory: ({ name, color, emoji }) =>
      writer.commit(() =>
        createCategoryRule({ name, color, emoji, existing: existing() }, ctx.deps),
      ),

    updateCategory: (id, patch) =>
      writer.commit(() => {
        const before = ctx.get().byId[id];
        return before === undefined
          ? null
          : updateCategoryRule(before, patch, existing(), ctx.deps);
      }),

    setStatus: (id, status) =>
      writer.commit(() => {
        const before = ctx.get().byId[id];
        return before === undefined
          ? null
          : transitionCategory(before, status, existing(), ctx.deps);
      }),
  };
}

/** 순서 변경 (R5). 재매김은 **활성 목록 안에서만** 일어난다 — 종료된 카테고리는 `order` 를 쓰지 않는다. */
function createOrderActions(
  ctx: CategoryContext,
  writer: CategoryWriter,
): Pick<CategoryActions, 'reorder' | 'moveBy'> {
  const reorder = (id: CategoryId, targetIndex: number): Promise<boolean> => {
    const all = Object.values(ctx.get().byId);
    const active = activeCategories(all);
    if (!active.some((category) => category.id === id)) {
      // 종료된(또는 없는) 카테고리는 활성 목록의 좌표가 없다 — 실패가 아니라 대상 없음이다.
      return Promise.resolve(false);
    }
    return writer.optimistic(active, () => reorderCategories(all, id, targetIndex, ctx.deps));
  };

  return {
    reorder,
    moveBy: (id, direction) => {
      const active = activeCategories(Object.values(ctx.get().byId));
      const from = active.findIndex((category) => category.id === id);
      if (from === -1) {
        return Promise.resolve(false);
      }
      const to = from + direction;
      if (to < 0 || to >= active.length) {
        return Promise.resolve(false);
      }
      return reorder(id, to);
    },
  };
}

/**
 * 액션 전부. 스토어는 이 결과를 상태에 펼쳐 넣기만 한다.
 *
 * **`writer` 를 주입받는다** — 안에서 만들면 삭제 액션(`createRemovalActions`)이 자기 writer 를
 * 만들게 되고, 두 갈래 큐가 서로의 결과를 못 본다. 생성이 저장 중일 때 삭제가 시작되면
 * 이름 유일성(R2)·`order` 모집단(R5)이 한 건 낡은 채로 계획이 선다. 스토어가 큐 하나를 만들어
 * 두 묶음에 같이 넘긴다. (`optimistic` 경로의 계획은 여전히 큐 밖에서 선다 — `category-writes.ts` 머리말.)
 */
export function createCategoryActions(
  ctx: CategoryContext,
  writer: CategoryWriter,
): CategoryActions {
  return {
    confirmAudience: async (id, canonical, allowed = () => true) => {
      const { clearCategoryVisibility, confirmCategoryVisibility } =
        await import('@/domain/category/visibility-cache');
      return writer.commit(() => {
        if (!allowed()) return null;
        const category = ctx.get().byId[id];
        if (category === undefined) return null;
        return canonical === null
          ? clearCategoryVisibility(category, ctx.deps)
          : confirmCategoryVisibility(category, canonical, ctx.deps);
      });
    },
    ...createLoadAction(ctx, writer),
    ...createEntryActions(ctx, writer),
    ...createOrderActions(ctx, writer),
    clearError: () => {
      ctx.set({ error: null });
    },
  };
}
