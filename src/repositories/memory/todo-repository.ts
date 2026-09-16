// memory 투두 저장소. 조회는 전부 `memory/live.ts` 헬퍼를 거치고(툼스톤 필터 한 곳), 정렬은
// 도메인 `sortTodos`·계약 `compareSearchResults` 만 쓴다 — indexeddb 구현과 순서가 갈릴 자리가 없다.
import { sortTodos } from '@/domain/todo/ordering';
import type { Todo } from '@/domain/todo/todo';

import {
  liveAll,
  liveBetween,
  liveBy,
  liveOne,
  put,
  type MemoryTables,
} from '@/repositories/memory/live';
import { compareSearchResults, matchesTodoQuery } from '@/repositories/ordering';
import type { TodoRepository } from '@/repositories/todo-repository';

/** 주어진 테이블 묶음 위에서 동작하는 투두 저장소. */
export function createMemoryTodoRepository(tables: MemoryTables): TodoRepository {
  const table = tables.todos;
  return {
    getById: (id) => liveOne(table, id),
    listByDate: async (date) => sortTodos(await liveBy(table, 'date', date)),
    listByDateRange: async (from, to) => sortTodos(await liveBetween(table, 'date', from, to)),
    listByCategory: async (categoryId) => sortTodos(await liveBy(table, 'categoryId', categoryId)),
    listAll: async () => sortTodos(await liveAll(table)),
    search: async (query, limit) => {
      const matched: Todo[] = (await liveAll(table)).filter((todo) =>
        matchesTodoQuery(todo, query),
      );
      return matched.sort(compareSearchResults).slice(0, Math.max(limit, 0));
    },
    upsert: (todo) => put(table, todo),
  };
}
