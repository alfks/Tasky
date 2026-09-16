// IndexedDB 구현의 조립 지점. 다섯 저장소가 **같은 `Store`**(= 하나의 Dexie 인스턴스)를 받으므로
// `DatasetRepository.write` 의 결과가 엔티티 조회에 그대로 보인다.
//
// 묶음을 인자로 받는 것이 memory 쪽(`createMemoryRepositories`)과의 유일한 차이이자, 계약 테스트가
// 호출마다 **서로 격리된** 묶음을 만들 수 있는 이유다(`query.ts` 의 `createStore` — 이름이 다른 DB 를 연다).
// 기본값은 앱 DB(`tasky`) 묶음이라 `src/app/providers.tsx` 는 인자 없이 부른다.
import type { Repositories } from '@/repositories/container';

import { createIndexedDbCategoryRepository } from '@/infra/indexeddb/category-indexeddb-repository';
import { createIndexedDbDatasetRepository } from '@/infra/indexeddb/dataset-indexeddb-repository';
import { createIndexedDbFocusSessionRepository } from '@/infra/indexeddb/focus-session-indexeddb-repository';
import { tables, type Store } from '@/infra/indexeddb/query';
import { createIndexedDbSettingsRepository } from '@/infra/indexeddb/settings-indexeddb-repository';
import { createIndexedDbTodoRepository } from '@/infra/indexeddb/todo-indexeddb-repository';

/** 한 묶음 위의 IndexedDB 구현 한 벌. 조립은 `src/app/providers.tsx` 가 한다(ADR-0006 규칙 6). */
export function createIndexedDbRepositories(store: Store = tables): Repositories {
  return {
    todos: createIndexedDbTodoRepository(store),
    categories: createIndexedDbCategoryRepository(store),
    settings: createIndexedDbSettingsRepository(store),
    focusSessions: createIndexedDbFocusSessionRepository(store),
    dataset: createIndexedDbDatasetRepository(store),
  };
}
