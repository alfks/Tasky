// IndexedDB 루틴 저장소.
import { compareRoutines } from '@/domain/routine/routine.rules';

import type { RoutineRepository } from '@/repositories/routine-repository';

import { liveAll, liveOne, put, type Store } from '@/infra/indexeddb/query';

/**
 * Dexie 테이블 위에서 동작하는 루틴 저장소. 인덱스가 `'id'` 뿐이라(ADR-0016 정정) `list()` 는 전량을
 * 읽고 메모리에서 `active` 로 거른다 — 정렬은 도메인(`routine.rules.ts#compareRoutines`)이 한다.
 */
export function createIndexedDbRoutineRepository(store: Store): RoutineRepository {
  const table = store.routines;
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
