// IndexedDB 카테고리 저장소. 정렬은 도메인(`activeCategories`·`sortCategoriesForDisplay`)이 단일 소스다.
import { activeCategories, sortCategoriesForDisplay } from '@/domain/category/category.rules';

import type { CategoryRepository } from '@/repositories/category-repository';

import { liveOne, liveOrderBy, put, type Store } from '@/infra/indexeddb/query';

/**
 * Dexie 테이블 위에서 동작하는 카테고리 저장소.
 *
 * `liveOrderBy(table, 'order')` 가 `order` 인덱스를 타고(툼스톤 제외), 그 위에 도메인 정렬을 얹는다.
 * `order` 가 같은 로우의 순서는 IndexedDB 인덱스가 기본 키(`id`) 오름차순으로 끊으므로
 * memory 의 `liveOrderBy`(명시적 id 타이브레이크)와 같은 결과가 된다.
 */
export function createIndexedDbCategoryRepository(store: Store): CategoryRepository {
  const table = store.categories;
  return {
    getById: (id) => liveOne(table, id),
    list: async (options) => {
      const rows = await liveOrderBy(table, 'order');
      return options?.includeClosed === true
        ? sortCategoriesForDisplay(rows)
        : activeCategories(rows);
    },
    upsert: (category) => put(table, category),
  };
}
