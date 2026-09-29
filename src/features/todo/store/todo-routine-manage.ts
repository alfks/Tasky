// 무기한 루틴 관리 액션(routine.md R7·R10·R13) — 로드·중지·재개·삭제·순서 변경. 다이얼로그·목록 UI 는
// T-83, 채우기(`materializeRoutines`)는 T-82 owns — 여기서는 관리 화면이 필요로 할 저장소 배선만 놓는다.
import type { DatasetWrite } from '@/domain/dataset';
import { addCivilDays } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import type { RoutineId } from '@/domain/ids';
import { rankRoutineInstances, reorderRoutines, routineRank } from '@/domain/routine/routine-rank';
import {
  deleteRoutine as deleteRoutineRule,
  pauseRoutine as pauseRoutineRule,
  resumeRoutine as resumeRoutineRule,
} from '@/domain/routine/routine.rules';

import { getRepositories } from '@/repositories/container';

import { MATERIALIZE_HORIZON_DAYS } from '@/features/todo/store/todo-routine-fill';
import {
  indexRoutines,
  messageOf,
  withoutRoutine,
  withRoutines,
  withTodos,
} from '@/features/todo/store/todo-state';
import type { TodoContext, TodoWriter, TodoWritesPlan } from '@/features/todo/store/todo-writes';

/** 루틴 관리 액션. 상태의 `routines`·`routineStatus` 조각을 바꾼다(순서 변경만 투두 `byId` 도 건드린다). */
export type RoutineManageActions = {
  /** 관리 화면이 열릴 때 부른다(자동 로드 없음). 중지된 것까지 전량. */
  loadRoutines: () => Promise<void>;
  /** 중지 (R7): 지연 생성만 멈춘다. 이미 만든 인스턴스는 그대로다. */
  pauseRoutine: (id: RoutineId) => Promise<boolean>;
  /** 재개 (R7): 소급 없이 다시 이어간다 — `today` 는 호출부(`useDateStripStore`)가 준다. */
  resumeRoutine: (id: RoutineId, today: DateKey) => Promise<boolean>;
  /** 삭제 (R10): 과거 인스턴스의 `routineId` 연결은 그대로 두고 이후 생성만 멈춘다. */
  removeRoutine: (id: RoutineId) => Promise<boolean>;
  /**
   * 순서 변경 (R13): 목록 안 `targetIndex` 자리로 옮기고 전체를 재매긴다. 같은 트랜잭션으로
   * `today ~ today+MATERIALIZE_HORIZON_DAYS` 의 **이미 만들어진 미완료 인스턴스**도 그룹마다 루틴
   * 순위대로 자리를 바꾼다(슬롯 집합 보존, `rankRoutineInstances`). 과거 날짜는 건드리지 않는다.
   */
  reorderRoutine: (id: RoutineId, targetIndex: number, today: DateKey) => Promise<boolean>;
};

/** 세 관리 액션이 공유하는 절차: 메모리 → 저장소 순으로 대상 루틴을 찾는다. */
async function findRoutine(ctx: TodoContext, id: RoutineId) {
  return ctx.get().routines[id] ?? (await getRepositories().routines.getById(id));
}

/**
 * 순서 변경 계획(R13). 루틴 행 재매김과 이미 만들어진 인스턴스의 슬롯 교환을 **한 트랜잭션**에 싣는다.
 * `fillFloor` 는 건드리지 않는다(ADR-0018 §결정 3 — 순서는 지연 생성과 무관하다). 도메인 함수를 동적
 * `import()` 로 부르지 않는 이유는 `RoutineManager.tsx` 머리 주석(청크 분할이 오히려 비싸다).
 */
async function planReorderRoutine(
  ctx: TodoContext,
  input: { id: RoutineId; targetIndex: number; today: DateKey },
): Promise<TodoWritesPlan | null> {
  const { routines, todos } = getRepositories();
  const all = await routines.list({ includeInactive: true });
  if (!all.some((routine) => routine.id === input.id)) {
    return null;
  }
  const changedRoutines = reorderRoutines(all, input.id, input.targetIndex, ctx.deps);
  const next = all.map(
    (routine) => changedRoutines.find((changed) => changed.id === routine.id) ?? routine,
  );
  const horizon = addCivilDays(input.today, MATERIALIZE_HORIZON_DAYS);
  const upcoming = await todos.listByDateRange(input.today, horizon);
  const changedTodos = rankRoutineInstances(upcoming, routineRank(next), ctx.deps);
  const writes: DatasetWrite[] = [
    ...changedRoutines.map((entity) => ({ table: 'routines' as const, entity })),
    ...changedTodos.map((entity) => ({ table: 'todos' as const, entity })),
  ];
  return {
    writes,
    apply: (state) => ({
      routines: withRoutines(state.routines, changedRoutines),
      // 보고 있는 날짜의 인스턴스만 메모리에 반영한다(R17) — 다른 날짜는 `loadDate` 가 집어 온다.
      byId: withTodos(
        state.byId,
        changedTodos.filter((todo) => todo.date === state.date),
      ),
    }),
  };
}

export function createRoutineManageActions(
  ctx: TodoContext,
  writer: TodoWriter,
): RoutineManageActions {
  return {
    loadRoutines: async () => {
      ctx.set({ routineStatus: 'loading' });
      try {
        const routines = await getRepositories().routines.list({ includeInactive: true });
        ctx.set({ routines: indexRoutines(routines), routineStatus: 'ready' });
      } catch (error) {
        ctx.set({ routineStatus: 'error', error: messageOf(error) });
      }
    },

    pauseRoutine: (id) =>
      writer.commitWrites(async () => {
        const routine = await findRoutine(ctx, id);
        if (routine === undefined) {
          return null;
        }
        const saved = pauseRoutineRule(routine, ctx.deps);
        const writes: DatasetWrite[] = [{ table: 'routines', entity: saved }];
        return { writes, apply: (state) => ({ routines: withRoutines(state.routines, [saved]) }) };
      }),

    resumeRoutine: (id, today) =>
      writer.commitWrites(async () => {
        const routine = await findRoutine(ctx, id);
        if (routine === undefined) {
          return null;
        }
        const saved = resumeRoutineRule(routine, today, ctx.deps);
        const writes: DatasetWrite[] = [{ table: 'routines', entity: saved }];
        return { writes, apply: (state) => ({ routines: withRoutines(state.routines, [saved]) }) };
      }),

    removeRoutine: (id) =>
      writer.commitWrites(async () => {
        const routine = await findRoutine(ctx, id);
        if (routine === undefined) {
          return null;
        }
        const saved = deleteRoutineRule(routine, ctx.deps);
        const writes: DatasetWrite[] = [{ table: 'routines', entity: saved }];
        return { writes, apply: (state) => ({ routines: withoutRoutine(state.routines, id) }) };
      }),

    reorderRoutine: (id, targetIndex, today) =>
      writer.commitWrites(() => planReorderRoutine(ctx, { id, targetIndex, today })),
  };
}
