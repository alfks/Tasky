// 루틴 등록·되돌리기(routine.md R2~R5, R21 확장) + 지연 생성 배선(R6). `todo-actions.ts` 가 300줄
// 제한(code-style §5)을 넘겨 이 파일로 뗐다 — 루틴 관리(중지·재개·삭제)는 `todo-routine-manage.ts`.
//
// **등록은 이제 `Routine` 레코드를 항상 저장한다**(R5, R21과의 핵심 차이). 종료일이 있든 없든
// `createRoutineRule` 이 레코드를 만들고, `planRoutineFill`(ADR-0017 워터마크)이 그 구간의 투두를
// 계획한다. 즉시 채우기(등록 시점, R3·R4)와 지연 생성(방문 시점, R6)은 **같은 계산**을 쓴다 — 구간만
// 다르다(등록은 `resolveImmediateFillThrough`, 방문은 날짜 스트립이 새로 연 범위).
import type { DatasetWrite } from '@/domain/dataset';
import { addCivilDays } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import type { CategoryId, RoutineId, TodoId } from '@/domain/ids';
import type { Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { planRoutineFill, resolveImmediateFillThrough } from '@/domain/routine/routine-fill';
import {
  createRoutine as createRoutineRule,
  deleteRoutine as deleteRoutineRule,
} from '@/domain/routine/routine.rules';
import type { RoutineRecurrence } from '@/domain/todo/routine.rules';
import type { Todo } from '@/domain/todo/todo';
import { deleteTodo } from '@/domain/todo/todo.rules';

import { getRepositories } from '@/repositories/container';

import {
  withoutRoutine,
  withoutTodo,
  withRoutines,
  withTodos,
} from '@/features/todo/store/todo-state';
import type { TodoContext, TodoWriter, TodoWritesPlan } from '@/features/todo/store/todo-writes';

/** 지연 생성(R6)이 한 번에 내다보는 최대 구간. 무기한·매일 루틴도 한 번의 방문이 이 안에서 끝난다. */
export const MATERIALIZE_HORIZON_DAYS = 366;

/** 루틴 등록·되돌리기·지연 생성 세 액션. `TodoActions`(`todo-actions.ts`)가 그대로 펼쳐 넣는다. */
export type RoutineFillActions = {
  /**
   * 루틴 등록 (routine.md R2~R5, R21 확장): `Routine` 레코드를 저장하고 그 구간(종료일이 있으면
   * 전체, 없으면 지금 보이는 범위 끝까지, R3)을 즉시 채운다. 결과가 0건이어도(R4) 레코드는
   * 저장된다 — 실패가 아니다. 성공하면 실제로 만든 투두들의 id 를 돌려준다.
   */
  createRoutine: (input: {
    categoryId: CategoryId;
    title: string;
    memo?: string;
    startDate: DateKey;
    /** 없으면 무기한(R2) — 이 경우에만 이후 R6 지연 생성이 의미가 있다. */
    endDate?: DateKey;
    recurrence: RoutineRecurrence;
  }) => Promise<TodoId[] | false>;
  /**
   * 등록 되돌리기 (R21 확장): 방금 만든 인스턴스와 **그 루틴 레코드 자체**를 함께 지운다 — 인스턴스만
   * 지우고 레코드를 남기면 다음 방문에 R6 가 그대로 다시 채워 "되돌리기"가 거짓말이 된다.
   */
  undoRoutine: (ids: readonly TodoId[]) => Promise<boolean>;
  /**
   * 지연 생성 배선 (R6): 날짜 스트립이 새 범위를 열 때마다 부른다(`DateStrip.onVisibleRange` →
   * `ShellHeader`). 무기한 루틴 중 워터마크가 `to` 에 못 미친 것만 그 구간을 채운다. 채울 것이
   * 없으면(보통의 경우) 저장소에 쓰지 않고 조회만으로 끝난다.
   */
  materializeRoutines: (input: { from: DateKey; to: DateKey; today: DateKey }) => Promise<boolean>;
};

/** 종료일 있는 등록도 포함해 **항상** `Routine` 레코드를 만들고, 그 구간을 즉시 채운다(R3~R5). */
async function planCreateRoutine(
  ctx: TodoContext,
  input: {
    categoryId: CategoryId;
    title: string;
    memo?: string;
    startDate: DateKey;
    endDate?: DateKey;
    recurrence: RoutineRecurrence;
  },
): Promise<{ plan: TodoWritesPlan | null; createdIds: TodoId[] }> {
  const routine = createRoutineRule(
    {
      title: input.title,
      memo: input.memo,
      categoryId: input.categoryId,
      recurrence: input.recurrence,
      startDate: input.startDate,
      endDate: input.endDate,
    },
    ctx.deps,
  );
  const visibleRangeEnd = ctx.get().visibleRange?.to ?? input.startDate;
  const through = resolveImmediateFillThrough({
    startDate: input.startDate,
    endDate: input.endDate,
    visibleRangeEnd,
  });
  const existing = await getRepositories().todos.listByDateRange(input.startDate, through);
  const filled = planRoutineFill({ routine, through, existing }, ctx.deps);
  // `through >= startDate` 는 `resolveImmediateFillThrough` 가 늘 보장하고 `routine.active` 는 방금
  // 만든 레코드라 항상 true 다 — `planRoutineFill` 이 null 을 돌려줄 조건이 성립하지 않는다. 그래도
  // 시그니처가 `| null` 이라 방어적으로만 다룬다(대상 없음과 같은 취급 — 저장하지 않고 실패).
  if (filled === null) {
    return { plan: null, createdIds: [] };
  }
  const writes: DatasetWrite[] = [
    ...filled.todos.map((entity) => ({ table: 'todos' as const, entity })),
    { table: 'routines' as const, entity: filled.routine },
  ];
  return {
    plan: {
      writes,
      apply: (state) => {
        const visible = filled.todos.filter((todo) => todo.date === state.date);
        return {
          byId: visible.length === 0 ? state.byId : withTodos(state.byId, visible),
          routines: withRoutines(state.routines, [filled.routine]),
        };
      },
    },
    createdIds: filled.todos.map((todo) => todo.id),
  };
}

/** 인스턴스들과 그 루틴 레코드(들)를 함께 지우는 계획을 짠다. 이미 없는 id 는 조용히 건너뛴다. */
async function planUndoRoutine(ctx: TodoContext, ids: readonly TodoId[]): Promise<TodoWritesPlan> {
  const found = await Promise.all(ids.map((id) => getRepositories().todos.getById(id)));
  const todos = found.filter((todo): todo is Todo => todo !== undefined);
  if (todos.length === 0) {
    return { writes: [], apply: () => ({}) };
  }
  const deletedTodos = todos.map((todo) => deleteTodo(todo, ctx.deps));
  const routineIds = new Set(
    todos.map((todo) => todo.routineId).filter((id): id is RoutineId => id !== undefined),
  );
  const foundRoutines = await Promise.all(
    [...routineIds].map((id) => getRepositories().routines.getById(id)),
  );
  const deletedRoutines = foundRoutines
    .filter((routine): routine is Routine => routine !== undefined)
    .map((routine) => deleteRoutineRule(routine, ctx.deps));
  const writes: DatasetWrite[] = [
    ...deletedTodos.map((entity) => ({ table: 'todos' as const, entity })),
    ...deletedRoutines.map((entity) => ({ table: 'routines' as const, entity })),
  ];
  return {
    writes,
    apply: (state) => ({
      byId: deletedTodos.reduce((acc, todo) => withoutTodo(acc, todo.id), state.byId),
      routines: deletedRoutines.reduce(
        (acc, routine) => withoutRoutine(acc, routine.id),
        state.routines,
      ),
    }),
  };
}

/** 지연 생성(R6) 계획: 워터마크가 `through` 에 못 미친 무기한 루틴만, 살아 있는 카테고리만 채운다. */
async function planMaterializeRoutines(
  ctx: TodoContext,
  input: { to: DateKey; today: DateKey },
): Promise<TodoWritesPlan> {
  const { routines, todos, categories } = getRepositories();
  const [all, liveCategories] = await Promise.all([
    routines.list({ includeInactive: true }), // 관리(T-83)·🔁 배지가 함께 읽는 상태를 여기서 채운다.
    categories.list(),
  ]);
  const horizon = addCivilDays(input.today, MATERIALIZE_HORIZON_DAYS);
  const through = input.to < horizon ? input.to : horizon;
  const liveIds = new Set(liveCategories.map((category) => category.id));
  const due = all.filter(
    (routine) =>
      routine.active && liveIds.has(routine.categoryId) && routine.materializedThrough < through,
  );
  if (due.length === 0) {
    // 조회 2회, 쓰기 0회로 끝나는 보통의 경우(R6) — 그래도 state.routines 는 최신으로 맞춘다.
    return { writes: [], apply: (state) => ({ routines: withRoutines(state.routines, all) }) };
  }

  const fillFrom = due
    .map((routine) => addCivilDays(routine.materializedThrough, 1))
    .sort()[0] as DateKey;
  const existing = await todos.listByDateRange(fillFrom, through);
  const created: Persistable<Todo>[] = [];
  const updated: Persistable<Routine>[] = [];
  const writes: DatasetWrite[] = [];
  for (const routine of due) {
    const plan = planRoutineFill(
      { routine, through, existing: [...existing, ...created] },
      ctx.deps,
    );
    if (plan === null) continue;
    created.push(...plan.todos);
    updated.push(plan.routine);
    writes.push(...plan.todos.map((entity) => ({ table: 'todos' as const, entity })), {
      table: 'routines' as const,
      entity: plan.routine,
    });
  }
  return {
    writes,
    apply: (state) => ({
      byId: withTodos(
        state.byId,
        created.filter((todo) => todo.date === state.date),
      ),
      routines: withRoutines(withRoutines(state.routines, all), updated),
    }),
  };
}

export function createRoutineFillActions(ctx: TodoContext, writer: TodoWriter): RoutineFillActions {
  return {
    createRoutine: async (input) => {
      let createdIds: TodoId[] = [];
      const ok = await writer.commitWrites(async () => {
        const { plan, createdIds: ids } = await planCreateRoutine(ctx, input);
        createdIds = ids;
        return plan;
      });
      return ok ? createdIds : false;
    },

    undoRoutine: (ids) => writer.commitWrites(() => planUndoRoutine(ctx, ids)),

    materializeRoutines: ({ from, to, today }) => {
      // 다음 등록(`createRoutine`)의 R3 "보이는 범위 끝" 이 이 값을 읽는다 — 쓰기 큐 밖에서 즉시
      // 반영해야, 이 호출이 아직 큐를 기다리는 중이어도 그 사이의 등록이 최신 범위를 본다.
      ctx.set({ visibleRange: { from, to } });
      return writer.commitWrites(() => planMaterializeRoutines(ctx, { to, today }));
    },
  };
}
