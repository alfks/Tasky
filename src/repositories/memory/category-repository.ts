// memory 카테고리 저장소. 정렬은 도메인(`activeCategories`·`sortCategoriesForDisplay`)이 단일 소스다.
import { activeCategories, sortCategoriesForDisplay } from '@/domain/category/category.rules';

import type { CategoryRepository } from '@/repositories/category-repository';
import {
  deletedByIds,
  liveOne,
  liveOrderBy,
  put,
  type MemoryTables,
} from '@/repositories/memory/live';

/**
 * 주어진 테이블 묶음 위에서 동작하는 카테고리 저장소.
 *
 * `liveOrderBy(table, 'order')` 는 indexeddb 구현이 `order` 인덱스로 하는 일과 같고(툼스톤 제외),
 * 그 위에 도메인 정렬을 얹는다. 도메인 정렬 함수도 툼스톤을 걸러내지만 이미 걸러진 배열이라
 * 결과에 영향이 없다 — 필터의 **진입점**은 여전히 `memory/live.ts` 하나다(ADR-0007 결정 5).
 */
export function createMemoryCategoryRepository(tables: MemoryTables): CategoryRepository {
  const table = tables.categories;
  return {
    getById: (id) => liveOne(table, id),
    list: async (options) => {
      const rows = await liveOrderBy(table, 'order');
      return options?.includeClosed === true
        ? sortCategoriesForDisplay(rows)
        : activeCategories(rows);
    },
    listDeletedByIds: (ids) => deletedByIds(table, ids),
    upsert: (category) => put(table, category),
  };
}
