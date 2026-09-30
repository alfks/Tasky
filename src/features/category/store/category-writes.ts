// 카테고리 쓰기의 공통 배선 — **언제 저장하고 실패하면 무엇을 되돌리는가**만 담는다.
// 검증·정렬·재매김·시드는 전부 `@/domain/category/*` 의 순수 함수가 하고(복제 금지), 액션 조립은
// `category-actions.ts`, 상태 모양은 `category-state.ts` 다.
//
// **저장은 전부 한 줄로 직렬화한다**(`serialize`). 직렬화가 없으면 두 액션이 같은 스냅샷을 읽는다:
// 연속으로 카테고리를 만들면 둘 다 활성 최대 `order` 를 같은 값으로 읽어 **중복 발급**되고(R5 위반),
// 같은 이름 유일성 검사(R2)도 서로의 결과를 보지 못한다. 큐는 스토어당 하나이고
// `category-store.ts` 가 만들어 생성·수정 액션과 삭제 액션에 **같은 것**을 넘긴다(각자 만들던 시절의
// 경합은 `category-write-queue.test.ts` 가 고정한다).
//
// **단, "계획을 큐 안에서 세운다" 가 참인 것은 `commit`·`applyWrites` 뿐이다.** `optimistic` 은
// `build()` 를 큐 **밖에서 동기로** 부르고 큐에는 저장만 넣는다 — 손이 움직인 자리(드래그·`Alt+↑/↓`)에
// 결과가 즉시 보여야 하기 때문이다(R5). 그래서 순서 변경은 **그 순간 화면에 있는 목록**을 기준으로
// 재매김하며, 다른 쓰기가 저장 중이면 그 결과를 아직 못 본 상태로 계산될 수 있다. 재매김은 활성 목록을
// 0..n-1 로 다시 쓰므로 그 창에서도 `order` 가 겹치지는 않지만, "큐가 모든 읽기를 직렬화한다" 는
// 아니다. 그 축까지 닫으려면 커밋 시점 재계산(rebase)이 필요하고 그건 별도 결정이다.
//
// 적재(`load`)는 읽기라 큐에 넣지 않는다.
import type { Category } from '@/domain/category/category';
import type { DatasetWrite } from '@/domain/dataset';
import type { MetaDeps, Persistable } from '@/domain/meta';

import { getRepositories } from '@/repositories/container';

import {
  messageOf,
  withCategories,
  type CategoryState,
} from '@/features/category/store/category-state';

/** 액션이 스토어를 읽고 쓰는 통로. zustand 의 `set`·`get` 을 그대로 받는다. */
export type CategoryContext = {
  readonly set: (partial: Partial<CategoryState>) => void;
  readonly get: () => CategoryState;
  readonly deps: MetaDeps;
};

/**
 * 저장할 엔티티를 만든다. **차례가 왔을 때** 실행되므로 `get()` 으로 최신 상태를 읽어도 안전하다.
 * `null` 은 "대상이 없다" — 쓰지 않고 `false` 이며 `error` 는 건드리지 않는다(없는 id 는 실패가 아니다).
 */
export type CategoryBuild = () =>
  Promise<Persistable<Category> | null> | Persistable<Category> | null;

/** 교차 테이블 쓰기를 만든다. 시드(R18)와 삭제·되돌리기(R13·R15)가 쓰는 경로다. */
export type DatasetBuild = () => Promise<readonly DatasetWrite[]> | readonly DatasetWrite[];

/** 액션이 쓰는 세 가지 저장 경로. */
export type CategoryWriter = {
  /** 한 건을 저장하고 성공한 뒤에만 상태를 바꾼다(생성·수정·상태 전이). */
  commit: (build: CategoryBuild) => Promise<boolean>;
  /**
   * 화면에 먼저 반영하고 한 트랜잭션으로 저장한다. 실패하면 `previous` 로 되돌린다.
   * 순서 변경(R5)처럼 손이 움직인 자리에 결과가 바로 보여야 하는 액션만 쓴다.
   */
  optimistic: (
    previous: readonly Category[],
    build: () => readonly Persistable<Category>[],
  ) => Promise<boolean>;
  /**
   * 여러 테이블을 **단일 트랜잭션**으로 쓰고 카테고리 쪽 결과만 상태에 반영한다(툼스톤은 맵에서 내린다).
   * 시드(카테고리 + 설정, R18)가 쓰고, **삭제·되돌리기(R13·R15)의 `planCategoryRemoval*` 결과를 그대로
   * 넘기는 경로**이기도 하다 — T-12b 가 이 함수를 쓰면 `category-writes.ts` 를 고칠 일이 없다.
   */
  applyWrites: (build: DatasetBuild, allowed?: () => boolean) => Promise<boolean>;
};

/** 앞의 쓰기가 끝난 뒤에 `task` 를 시작한다. 앞이 실패해도 큐는 이어진다. */
type Serialize = <T>(task: () => Promise<T>) => Promise<T>;

/** 쓰기 한 줄 큐 하나. 스토어마다 따로 만들어 테스트의 격리 인스턴스끼리 큐를 공유하지 않는다. */
function createWriteQueue(): Serialize {
  let queue: Promise<unknown> = Promise.resolve();
  return (task) => {
    const run = queue.then(task, task);
    queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  };
}

/** 교차 테이블 쓰기 중 카테고리 로우만. 상태에 반영할 대상이다. */
function categoriesIn(writes: readonly DatasetWrite[]): Persistable<Category>[] {
  const categories: Persistable<Category>[] = [];
  for (const write of writes) {
    if (write.table === 'categories') {
      categories.push(write.entity);
    }
  }
  return categories;
}

/** 스토어 하나마다 쓰기 배선 하나. */
export function createCategoryWriter(ctx: CategoryContext): CategoryWriter {
  const serialize = createWriteQueue();

  return {
    commit: (build) =>
      serialize(async () => {
        try {
          const entity = await build();
          if (entity === null) {
            return false;
          }
          await getRepositories().categories.upsert(entity);
          ctx.set({ byId: withCategories(ctx.get().byId, [entity]), error: null });
          return true;
        } catch (error) {
          ctx.set({ error: messageOf(error) });
          return false;
        }
      }),

    optimistic: (previous, build) => {
      let next: readonly Persistable<Category>[];
      try {
        next = build();
      } catch (error) {
        // 도메인 검증은 화면을 건드리기 전에 걸린다 — 문구만 남긴다.
        ctx.set({ error: messageOf(error) });
        return Promise.resolve(false);
      }
      if (next.length === 0) {
        return Promise.resolve(true);
      }
      ctx.set({ byId: withCategories(ctx.get().byId, next), error: null });
      return serialize(async () => {
        try {
          await getRepositories().dataset.write(
            next.map((entity) => ({ table: 'categories', entity })),
          );
          return true;
        } catch (error) {
          ctx.set({ byId: withCategories(ctx.get().byId, previous), error: messageOf(error) });
          return false;
        }
      });
    },

    applyWrites: (build, allowed = () => true) =>
      serialize(async () => {
        try {
          if (!allowed()) return false;
          const writes = await build();
          if (!allowed() || writes.length === 0) {
            return false;
          }
          await getRepositories().dataset.write(writes);
          if (!allowed()) return false;
          ctx.set({ byId: withCategories(ctx.get().byId, categoriesIn(writes)), error: null });
          return true;
        } catch (error) {
          if (allowed()) ctx.set({ error: messageOf(error) });
          return false;
        }
      }),
  };
}
