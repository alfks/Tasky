// memory 집중 세션 저장소. 정렬은 `compareFocusSessions` 하나로 고정한다.
import { isActiveFocusSession } from '@/domain/focus/focus-session.rules';

import type { FocusSessionRepository } from '@/repositories/focus-session-repository';
import {
  liveAll,
  liveBetween,
  liveBy,
  liveOne,
  put,
  type MemoryTables,
} from '@/repositories/memory/live';
import { compareFocusSessions } from '@/repositories/ordering';

/** 주어진 테이블 묶음 위에서 동작하는 집중 세션 저장소. */
export function createMemoryFocusSessionRepository(tables: MemoryTables): FocusSessionRepository {
  const table = tables.focusSessions;
  return {
    getActive: async () => {
      const active = (await liveAll(table)).filter(isActiveFocusSession);
      return active.sort(compareFocusSessions).at(-1);
    },
    getById: (id) => liveOne(table, id),
    listByDate: async (date) => (await liveBy(table, 'date', date)).sort(compareFocusSessions),
    listByDateRange: async (from, to) =>
      (await liveBetween(table, 'date', from, to)).sort(compareFocusSessions),
    listByTodo: async (todoId) =>
      (await liveBy(table, 'todoId', todoId)).sort(compareFocusSessions),
    listAll: async () => (await liveAll(table)).sort(compareFocusSessions),
    upsert: (session) => put(table, session),
  };
}
