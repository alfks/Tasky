// IndexedDB 투두 저장소. 조회는 전부 `query.ts` 헬퍼를 거치고(툼스톤 필터 한 곳), 정렬은 도메인
// `sortTodos`·계약 `compareSearchResults` 만 쓴다 — memory 구현과 순서가 갈릴 자리가 없다.
import { sortTodos } from '@/domain/todo/ordering';
import type { Todo } from '@/domain/todo/todo';

import { compareSearchResults, matchesTodoQuery } from '@/repositories/ordering';
import type { TodoRepository } from '@/repositories/todo-repository';

import { liveAll, liveBetween, liveBy, liveOne, put, type Store } from '@/infra/indexeddb/query';

/**
 * Dexie 테이블 위에서 동작하는 투두 저장소.
 *
 * `listByDate`·`listByCategory` 는 선언된 단일 인덱스를, `listByDateRange` 는 `date` 범위를 탄다.
 * `search` 만 `liveAll` 로 전량을 읽는다 — 부분 문자열 일치는 IndexedDB 인덱스가 다루지 못한다
 * (TECH_PLAN §8 의 "팔레트 검색 10,000개 ≤ 150ms" 가 이 경로의 예산이다).
 */
export function createIndexedDbTodoRepository(store: Store): TodoRepository {
  const table = store.todos;
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
