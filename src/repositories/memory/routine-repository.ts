// memory 루틴 저장소. 조회는 `memory/live.ts` 헬퍼를 거치고(툼스톤 필터 한 곳), 정렬·필터는
// 도메인(`compareRoutines`)·이 파일(`includeInactive`)만 한다 — indexeddb 구현과 갈릴 자리가 없다.
import { compareRoutines } from '@/domain/routine/routine.rules';

import { liveAll, liveOne, put, type MemoryTables } from '@/repositories/memory/live';
import type { RoutineRepository } from '@/repositories/routine-repository';

/** 주어진 테이블 묶음 위에서 동작하는 루틴 저장소. `tables` 는 `DatasetRepository`(같은 묶음)와 공유한다. */
export function createMemoryRoutineRepository(tables: MemoryTables): RoutineRepository {
  const table = tables.routines;
  return {
    getById: (id) => liveOne(table, id),
    list: async (options) => {
      const all = await liveAll(table);
      const filtered = options?.includeInactive === true ? all : all.filter((r) => r.active);
      return filtered.sort(compareRoutines);
    },
    upsert: (routine) => put(table, routine),
  };
}
