// 무기한 루틴 관리 액션(routine.md R7·R10) — 로드·중지·재개·삭제. 다이얼로그·목록 UI 는 T-83, 채우기
// (`materializeRoutines`)는 T-82 owns — 여기서는 관리 화면이 필요로 할 저장소 배선만 놓는다.
import type { DatasetWrite } from '@/domain/dataset';
import type { DateKey } from '@/domain/date/date-key';
import type { RoutineId } from '@/domain/ids';
import {
  deleteRoutine as deleteRoutineRule,
  pauseRoutine as pauseRoutineRule,
  resumeRoutine as resumeRoutineRule,
} from '@/domain/routine/routine.rules';

import { getRepositories } from '@/repositories/container';

import {
  indexRoutines,
  messageOf,
  withoutRoutine,
  withRoutines,
} from '@/features/todo/store/todo-state';
import type { TodoContext, TodoWriter } from '@/features/todo/store/todo-writes';

/** 루틴 관리 액션. 상태의 `routines`·`routineStatus` 조각만 바꾼다(투두 `byId` 는 건드리지 않는다). */
export type RoutineManageActions = {
  /** 관리 화면이 열릴 때 부른다(자동 로드 없음). 중지된 것까지 전량. */
  loadRoutines: () => Promise<void>;
  /** 중지 (R7): 지연 생성만 멈춘다. 이미 만든 인스턴스는 그대로다. */
  pauseRoutine: (id: RoutineId) => Promise<boolean>;
  /** 재개 (R7): 소급 없이 다시 이어간다 — `today` 는 호출부(`useDateStripStore`)가 준다. */
  resumeRoutine: (id: RoutineId, today: DateKey) => Promise<boolean>;
  /** 삭제 (R10): 과거 인스턴스의 `routineId` 연결은 그대로 두고 이후 생성만 멈춘다. */
  removeRoutine: (id: RoutineId) => Promise<boolean>;
};

/** 세 관리 액션이 공유하는 절차: 메모리 → 저장소 순으로 대상 루틴을 찾는다. */
async function findRoutine(ctx: TodoContext, id: RoutineId) {
  return ctx.get().routines[id] ?? (await getRepositories().routines.getById(id));
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
  };
}
