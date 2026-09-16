// 투두 스토어 (todo.md R5~R7·R10~R12·R15·R17·R18). 선택 날짜 한 건의 투두만 메모리에 둔다(R17).
//
// 이 파일이 직접 정하는 것은 **언제 저장하고 실패하면 무엇을 되돌리는가** 뿐이다. 정렬·재매김·검증은
// 전부 `@/domain/todo/*` 의 순수 함수가 하고(복제 금지 — 복제하면 memory·indexeddb·화면이 갈린다),
// 저장은 `@/repositories/container` 로 주입된 인터페이스로만 한다(Dexie 를 직접 부르지 않는다).
//
// **낙관적 갱신을 쓰는 액션과 쓰지 않는 액션**:
// - `toggleDone`·`reorder`·`moveBy` 는 손이 움직인 자리에 결과가 바로 보여야 해서 낙관적이다
//   (R6 "50ms 안 반영", R11 드래그). 실패하면 건드린 투두만 이전 값으로 되돌린다.
// - `addTodo`·`editTodo`·`moveToDate`·`changeCategory`·`removeTodo` 는 저장이 끝난 뒤 반영한다.
//   앞의 넷은 도메인 검증(R1·R2)이 먼저 걸리고, 다섯 모두 입력 행·편집 패널·확인 대화상자를 거쳐
//   이미 한 박자가 있다. 낙관적으로 넣었다가 되돌리면 방금 추가한 행이 사라지는 편이 더 놀랍다
//   (code-style §4: "낙관적 업데이트는 토글 등 즉시성 필요한 액션에만").
//
// 롤백의 한계: 되돌리는 값은 **액션이 시작할 때 읽은 값**이다. 같은 투두를 건드리는 두 액션이 겹치면
// 나중에 실패한 쪽이 먼저 성공한 쪽의 결과를 덮을 수 있다. 화면에서 한 항목에 두 쓰기를 동시에 거는
// 경로는 지금 없고(체크박스는 await 사이 비활성, 드래그는 하나씩), 생기면 여기서 rev 비교를 더한다.
import { create } from 'zustand';

import type { DatasetWrite } from '@/domain/dataset';
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId, TodoId } from '@/domain/ids';
import type { MetaDeps, Persistable } from '@/domain/meta';
import { moveTodoBy, reorderTodos, todosInGroup } from '@/domain/todo/ordering';
import type { Todo } from '@/domain/todo/todo';
import {
  changeTodoCategory,
  createTodo,
  deleteTodo,
  editTodo,
  moveTodoToDate,
  toggleTodoDone,
} from '@/domain/todo/todo.rules';

import { getRepositories } from '@/repositories/container';

import {
  indexTodos,
  messageOf,
  withoutTodo,
  withTodos,
  type TodoMap,
  type TodoState,
} from '@/features/todo/store/todo-state';

import { nowIso } from '@/lib/date';
import { newId } from '@/lib/id';

/** 스토어의 액션 부분. 쓰기 액션은 성공 여부를 돌려준다 — 입력 행이 텍스트를 유지할지 판단한다(R3). */
export type TodoActions = {
  /** 그 날짜의 투두를 읽어 메모리를 교체한다. 늦게 도착한 이전 요청의 응답은 버린다. */
  loadDate: (date: DateKey) => Promise<void>;
  /** 새 투두 (R5). `order` 는 같은 날짜·카테고리 그룹의 끝이다. */
  addTodo: (input: { categoryId: CategoryId; title: string; memo?: string }) => Promise<boolean>;
  /** 완료 토글 (R6). 낙관적이고 `order` 는 바뀌지 않는다 — 아래로 내려가는 것은 정렬의 결과다(R7). */
  toggleDone: (id: TodoId, done: boolean) => Promise<boolean>;
  /** 제목·메모 편집 (R14). `memo: null` 은 메모 삭제. */
  editTodo: (id: TodoId, patch: { title?: string; memo?: string | null }) => Promise<boolean>;
  /** 날짜 이동 (R10). 대상 그룹 끝으로 가고, 보고 있는 날짜를 떠나면 메모리에서 내린다(R17). */
  moveToDate: (id: TodoId, date: DateKey) => Promise<boolean>;
  /** 카테고리 변경 (R12). 대상 그룹 끝으로 간다. */
  changeCategory: (id: TodoId, categoryId: CategoryId) => Promise<boolean>;
  /** 소프트 삭제 (R13·R18). 물리 삭제는 없다. */
  removeTodo: (id: TodoId) => Promise<boolean>;
  /** 미완료 투두를 그룹 수열의 `targetIndex` 자리로 (R11). 그룹 전체가 0..n-1 로 재매김된다. */
  reorder: (id: TodoId, targetIndex: number) => Promise<boolean>;
  /** `Alt+↑/↓`·메뉴 "위로/아래로" (R11). 완료 항목은 건너뛴다. */
  moveBy: (id: TodoId, direction: -1 | 1) => Promise<boolean>;
  /** 토스트를 닫을 때 문구를 지운다. */
  clearError: () => void;
};

/** 상태 + 액션. 컴포넌트는 selector 로 필요한 조각만 구독한다. */
export type TodoStore = TodoState & TodoActions;

/** 여러 건을 한 트랜잭션으로 저장한다 (R11 "한 번에 저장"). */
async function saveAll(entities: readonly Persistable<Todo>[]): Promise<void> {
  const writes: DatasetWrite[] = entities.map((entity) => ({ table: 'todos', entity }));
  await getRepositories().dataset.write(writes);
}

/** 실제 시계·UUID. 테스트는 `createTodoStore(fixedDeps())` 로 결정적인 주입기를 쓴다. */
const defaultDeps: MetaDeps = { now: nowIso, id: newId };

/**
 * 스토어 팩토리. 앱은 아래 `useTodoStore` 하나만 쓰고(code-style §4: feature 당 스토어 1개),
 * 테스트가 결정적인 `deps` 로 격리된 인스턴스를 만들 수 있도록 팩토리를 열어 둔다.
 */
export function createTodoStore(deps: MetaDeps = defaultDeps) {
  return create<TodoStore>()((set, get) => {
    /** 늦게 도착한 `loadDate` 응답을 버리기 위한 요청 번호. */
    let loadSeq = 0;

    /** 재매김 결과를 낙관적으로 반영하고, 저장이 실패하면 건드린 투두만 되돌린다 (R11). */
    const applyReorder = async (changed: readonly Persistable<Todo>[]): Promise<boolean> => {
      if (changed.length === 0) {
        return true;
      }
      const previous = changed.flatMap((todo) => {
        const before = get().byId[todo.id];
        return before === undefined ? [] : [before];
      });
      set({ byId: withTodos(get().byId, changed), error: null });
      try {
        await saveAll(changed);
        return true;
      } catch (error) {
        set({ byId: withTodos(get().byId, previous), error: messageOf(error) });
        return false;
      }
    };

    /** 저장이 성공한 뒤에만 상태를 바꾸는 쓰기 (낙관적이지 않은 액션의 공통 경로). */
    const commit = async (
      build: () => Promise<Persistable<Todo>> | Persistable<Todo>,
      apply: (byId: TodoMap, saved: Todo) => TodoMap,
    ): Promise<boolean> => {
      try {
        const entity = await build();
        await getRepositories().todos.upsert(entity);
        set({ byId: apply(get().byId, entity), error: null });
        return true;
      } catch (error) {
        set({ error: messageOf(error) });
        return false;
      }
    };

    return {
      byId: {},
      date: null,
      status: 'idle',
      error: null,

      loadDate: async (date) => {
        const seq = (loadSeq += 1);
        set({ date, byId: {}, status: 'loading', error: null });
        try {
          const todos = await getRepositories().todos.listByDate(date);
          if (seq === loadSeq) {
            set({ byId: indexTodos(todos), status: 'ready' });
          }
        } catch (error) {
          if (seq === loadSeq) {
            set({ status: 'error', error: messageOf(error) });
          }
        }
      },

      addTodo: async ({ categoryId, title, memo }) => {
        const date = get().date;
        if (date === null) {
          return false;
        }
        return commit(
          () => {
            const siblings = todosInGroup(Object.values(get().byId), date, categoryId);
            return createTodo({ categoryId, date, title, memo, siblings }, deps);
          },
          (byId, saved) => withTodos(byId, [saved]),
        );
      },

      toggleDone: async (id, done) => {
        const before = get().byId[id];
        if (before === undefined) {
          return false;
        }
        const next = toggleTodoDone(before, done, deps);
        set({ byId: withTodos(get().byId, [next]), error: null });
        try {
          await getRepositories().todos.upsert(next);
          return true;
        } catch (error) {
          set({ byId: withTodos(get().byId, [before]), error: messageOf(error) });
          return false;
        }
      },

      editTodo: async (id, patch) => {
        const before = get().byId[id];
        if (before === undefined) {
          return false;
        }
        return commit(
          () => editTodo(before, patch, deps),
          (byId, saved) => withTodos(byId, [saved]),
        );
      },

      moveToDate: async (id, date) => {
        const before = get().byId[id];
        if (before === undefined) {
          return false;
        }
        return commit(
          async () => {
            // 대상 날짜의 그룹은 메모리에 없다(R17) — `order` 를 계산할 만큼만 읽는다.
            const target =
              date === before.date
                ? Object.values(get().byId)
                : await getRepositories().todos.listByDate(date);
            const siblings = todosInGroup(target, date, before.categoryId);
            return moveTodoToDate(before, date, siblings, deps);
          },
          (byId, saved) =>
            saved.date === get().date ? withTodos(byId, [saved]) : withoutTodo(byId, id),
        );
      },

      changeCategory: async (id, categoryId) => {
        const before = get().byId[id];
        if (before === undefined) {
          return false;
        }
        return commit(
          () => {
            const siblings = todosInGroup(Object.values(get().byId), before.date, categoryId);
            return changeTodoCategory(before, categoryId, siblings, deps);
          },
          (byId, saved) => withTodos(byId, [saved]),
        );
      },

      removeTodo: async (id) => {
        const before = get().byId[id];
        if (before === undefined) {
          return false;
        }
        return commit(
          () => deleteTodo(before, deps),
          (byId) => withoutTodo(byId, id),
        );
      },

      reorder: async (id, targetIndex) => {
        const before = get().byId[id];
        if (before === undefined) {
          return false;
        }
        try {
          const group = todosInGroup(Object.values(get().byId), before.date, before.categoryId);
          return await applyReorder(reorderTodos(group, id, targetIndex, deps));
        } catch (error) {
          set({ error: messageOf(error) });
          return false;
        }
      },

      moveBy: async (id, direction) => {
        const before = get().byId[id];
        if (before === undefined) {
          return false;
        }
        try {
          const group = todosInGroup(Object.values(get().byId), before.date, before.categoryId);
          return await applyReorder(moveTodoBy(group, id, direction, deps));
        } catch (error) {
          set({ error: messageOf(error) });
          return false;
        }
      },

      clearError: () => {
        set({ error: null });
      },
    };
  });
}

/** 앱이 쓰는 단 하나의 투두 스토어. 컴포넌트는 selector 로 필요한 조각만 구독한다. */
export const useTodoStore = createTodoStore();
