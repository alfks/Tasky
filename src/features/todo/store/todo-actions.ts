// 투두 스토어의 액션 (todo.md R3·R5~R7·R10~R13·R17·R18). 저장 배선은 `todo-writes.ts` 가 맡는다.
//
// **낙관적 갱신을 쓰는 액션과 쓰지 않는 액션**:
// - `toggleDone`·`reorder`·`moveBy` 는 손이 움직인 자리에 결과가 바로 보여야 해서 낙관적이다
//   (R6 "50ms 안 반영", R11 드래그). 실패하면 건드린 투두만 이전 값으로 되돌린다.
// - `addTodo`·`editTodo`·`moveToDate`·`changeCategory`·`removeTodo` 는 저장이 끝난 뒤 반영한다.
//   앞의 넷은 도메인 검증(R1·R2)이 먼저 걸리고, 다섯 모두 입력 행·편집 패널·확인 대화상자를 거쳐
//   이미 한 박자가 있다. 낙관적으로 넣었다가 되돌리면 방금 추가한 행이 사라지는 편이 더 놀랍다
//   (code-style §4: "낙관적 업데이트는 토글 등 즉시성 필요한 액션에만").
//
// **쓰기 액션의 `false` 두 가지를 `error` 로 가른다**(T-15 가 R3 입력 행을 판단할 때 쓴다):
// `false` + `error !== null` 은 검증·저장 실패(입력 행은 텍스트를 유지한다),
// `false` + `error === null` 은 대상이 없는 것(이미 사라진 투두 — 다시 시도할 것이 없다).
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId, TodoId } from '@/domain/ids';
import { moveTodoBy, reorderTodos, todosInGroup } from '@/domain/todo/ordering';
import { expandRoutineDates, type RoutineRecurrence } from '@/domain/todo/routine.rules';
import type { Todo } from '@/domain/todo/todo';
import {
  changeTodoCategory,
  createTodo,
  deleteTodo,
  editTodo as editTodoRule,
  moveTodoToDate,
  toggleTodoDone,
} from '@/domain/todo/todo.rules';

import { getRepositories } from '@/repositories/container';

import { indexTodos, messageOf, withoutTodo, withTodos } from '@/features/todo/store/todo-state';
import {
  createTodoWriter,
  saveAll,
  upsertOne,
  type TodoContext,
  type TodoWriter,
} from '@/features/todo/store/todo-writes';

/** 스토어의 액션 부분. 쓰기 액션은 성공 여부를 돌려준다 — 입력 행이 텍스트를 유지할지 판단한다(R3). */
export type TodoActions = {
  /** 그 날짜의 투두를 읽어 메모리를 교체한다. 늦게 도착한 이전 요청의 응답은 버린다. */
  loadDate: (date: DateKey) => Promise<void>;
  /** 새 투두 (R5). `order` 는 같은 날짜·카테고리 그룹의 끝이다. 동시 호출도 겹치지 않는다(쓰기 직렬화). */
  addTodo: (input: { categoryId: CategoryId; title: string; memo?: string }) => Promise<boolean>;
  /** 완료 토글 (R6). **인자 `done` 이 목표 상태다**(반전이 아니다) — 같은 값으로 두 번 불러도 결과는 같다. */
  toggleDone: (id: TodoId, done: boolean) => Promise<boolean>;
  /** 제목·메모 편집 (R14). `memo: null` 은 메모 삭제. */
  editTodo: (id: TodoId, patch: { title?: string; memo?: string | null }) => Promise<boolean>;
  /**
   * 날짜 이동 (R10). 대상 그룹 끝으로 가고, 보고 있는 날짜를 떠나면 메모리에서 내린다(R17).
   * 메모리에 없는 id 도 저장소에서 집어 온다 — 토스트 "[되돌리기]" 가 떠난 투두를 다시 부르기 때문이다.
   */
  moveToDate: (id: TodoId, date: DateKey) => Promise<boolean>;
  /** 카테고리 변경 (R12). 대상 그룹 끝으로 간다. */
  changeCategory: (id: TodoId, categoryId: CategoryId) => Promise<boolean>;
  /** 소프트 삭제 (R13·R18). 물리 삭제는 없다. */
  removeTodo: (id: TodoId) => Promise<boolean>;
  /** 미완료 투두를 그룹 수열(`TodoGroup.sequence`)의 `targetIndex` 자리로 (R11). 그룹이 0..n-1 로 재매김된다. */
  reorder: (id: TodoId, targetIndex: number) => Promise<boolean>;
  /** `Alt+↑/↓`·메뉴 "위로/아래로" (R11). 완료 항목은 건너뛴다. */
  moveBy: (id: TodoId, direction: -1 | 1) => Promise<boolean>;
  /**
   * 루틴 등록 (R21): 시작~종료일 안에서 반복 패턴에 맞는 날짜마다 같은 카테고리·제목·메모의 투두를
   * 새로 만든다. "루틴" 자체는 저장하지 않는다 — 만들어진 각 투두는 그 뒤로 독립된 투두다.
   */
  createRoutine: (input: {
    categoryId: CategoryId;
    title: string;
    memo?: string;
    startDate: DateKey;
    endDate: DateKey;
    recurrence: RoutineRecurrence;
  }) => Promise<boolean>;
  /** 토스트를 닫을 때 문구를 지운다. */
  clearError: () => void;
};

/** 적재 (R17). 요청 번호로 늦게 도착한 이전 날짜의 응답을 버린다 — 날짜 스트립 연타 경로다. */
function createLoadAction(ctx: TodoContext): Pick<TodoActions, 'loadDate'> {
  let loadSeq = 0;
  return {
    loadDate: async (date) => {
      const seq = (loadSeq += 1);
      // 읽기 전에 비운다: 실패해도 이전 날짜의 투두가 화면에 남지 않는다(R17).
      ctx.set({ date, byId: {}, status: 'loading', error: null });
      try {
        const todos = await getRepositories().todos.listByDate(date);
        if (seq === loadSeq) {
          ctx.set({ byId: indexTodos(todos), status: 'ready' });
        }
      } catch (error) {
        if (seq === loadSeq) {
          ctx.set({ status: 'error', error: messageOf(error) });
        }
      }
    },
  };
}

/** 추가·토글·편집·삭제 (R5·R6·R13·R14·R18). */
function createEntryActions(
  ctx: TodoContext,
  writer: TodoWriter,
): Pick<TodoActions, 'addTodo' | 'toggleDone' | 'editTodo' | 'removeTodo'> {
  return {
    addTodo: ({ categoryId, title, memo }) =>
      writer.commit(
        () => {
          const { date, byId } = ctx.get();
          if (date === null) {
            return null;
          }
          const siblings = todosInGroup(Object.values(byId), date, categoryId);
          return createTodo({ categoryId, date, title, memo, siblings }, ctx.deps);
        },
        (byId, saved) => withTodos(byId, [saved]),
      ),

    toggleDone: (id, done) => {
      const before = ctx.get().byId[id];
      if (before === undefined) {
        return Promise.resolve(false);
      }
      return writer.optimistic([before], () => [toggleTodoDone(before, done, ctx.deps)], upsertOne);
    },

    editTodo: (id, patch) =>
      writer.commit(
        () => {
          const before = ctx.get().byId[id];
          return before === undefined ? null : editTodoRule(before, patch, ctx.deps);
        },
        (byId, saved) => withTodos(byId, [saved]),
      ),

    removeTodo: (id) =>
      writer.commit(
        () => {
          const before = ctx.get().byId[id];
          return before === undefined ? null : deleteTodo(before, ctx.deps);
        },
        (byId, saved) => withoutTodo(byId, saved.id),
      ),
  };
}

/** 그룹 이동 (R10·R12) — 둘 다 대상 그룹 끝으로 간다. */
function createMoveActions(
  ctx: TodoContext,
  writer: TodoWriter,
): Pick<TodoActions, 'moveToDate' | 'changeCategory'> {
  return {
    moveToDate: (id, date) =>
      writer.commit(
        async () => {
          // R10 되돌리기는 이미 메모리에서 내려간 투두를 다시 부른다 — 없으면 저장소에서 집어 온다.
          const before = ctx.get().byId[id] ?? (await getRepositories().todos.getById(id));
          if (before === undefined) {
            return null;
          }
          // 대상 날짜가 보고 있는 날짜면 메모리가 최신이고, 아니면 그 그룹만큼만 읽는다(R17).
          const target =
            date === ctx.get().date
              ? Object.values(ctx.get().byId)
              : await getRepositories().todos.listByDate(date);
          const siblings = todosInGroup(target, date, before.categoryId);
          return moveTodoToDate(before, date, siblings, ctx.deps);
        },
        (byId, saved) =>
          // 판정은 **저장이 끝난 시점의** 선택 날짜로 한다 — 기다리는 사이 날짜가 바뀌었을 수 있다.
          saved.date === ctx.get().date ? withTodos(byId, [saved]) : withoutTodo(byId, saved.id),
      ),

    changeCategory: (id, categoryId) =>
      writer.commit(
        () => {
          const before = ctx.get().byId[id];
          if (before === undefined) {
            return null;
          }
          // 대상은 **바꿀 카테고리** 그룹이다 — 원래 그룹으로 세면 이미 있는 항목과 `order` 가 겹친다.
          const siblings = todosInGroup(Object.values(ctx.get().byId), before.date, categoryId);
          return changeTodoCategory(before, categoryId, siblings, ctx.deps);
        },
        (byId, saved) => withTodos(byId, [saved]),
      ),
  };
}

/** 순서 변경 (R11). 재매김은 **같은 날짜·같은 카테고리** 그룹 안에서만 일어난다. */
function createOrderActions(
  ctx: TodoContext,
  writer: TodoWriter,
): Pick<TodoActions, 'reorder' | 'moveBy'> {
  const groupOf = (todo: Todo): Todo[] =>
    todosInGroup(Object.values(ctx.get().byId), todo.date, todo.categoryId);

  return {
    reorder: (id, targetIndex) => {
      const before = ctx.get().byId[id];
      if (before === undefined) {
        return Promise.resolve(false);
      }
      const group = groupOf(before);
      return writer.optimistic(
        group,
        () => reorderTodos(group, id, targetIndex, ctx.deps),
        saveAll,
      );
    },

    moveBy: (id, direction) => {
      const before = ctx.get().byId[id];
      if (before === undefined) {
        return Promise.resolve(false);
      }
      const group = groupOf(before);
      return writer.optimistic(group, () => moveTodoBy(group, id, direction, ctx.deps), saveAll);
    },
  };
}

/** 루틴 등록 (R21). 날짜별 `order` 는 그 날짜·카테고리의 기존 투두 끝이다(그룹 끝 규칙과 같다). */
function createRoutineAction(
  ctx: TodoContext,
  writer: TodoWriter,
): Pick<TodoActions, 'createRoutine'> {
  return {
    createRoutine: ({ categoryId, title, memo, startDate, endDate, recurrence }) =>
      writer.commitMany(async () => {
        const dates = expandRoutineDates({ startDate, endDate, recurrence });
        if (dates.length === 0) {
          return [];
        }
        const existing = await getRepositories().todos.listByDateRange(startDate, endDate);
        const siblingsByDate = new Map<DateKey, Todo[]>();
        for (const todo of existing) {
          if (todo.categoryId !== categoryId) continue;
          siblingsByDate.set(todo.date, [...(siblingsByDate.get(todo.date) ?? []), todo]);
        }
        return dates.map((date) =>
          createTodo(
            { categoryId, date, title, memo, siblings: siblingsByDate.get(date) ?? [] },
            ctx.deps,
          ),
        );
      }),
  };
}

/** 액션 전부. 스토어는 이 결과를 상태에 펼쳐 넣기만 한다. */
export function createTodoActions(ctx: TodoContext): TodoActions {
  const writer = createTodoWriter(ctx);
  return {
    ...createLoadAction(ctx),
    ...createEntryActions(ctx, writer),
    ...createMoveActions(ctx, writer),
    ...createOrderActions(ctx, writer),
    ...createRoutineAction(ctx, writer),
    clearError: () => {
      ctx.set({ error: null });
    },
  };
}
