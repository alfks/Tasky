// IndexedDB 구현의 조립 지점. 다섯 저장소가 모두 `query.ts` 의 같은 테이블 핸들(= 하나뿐인 Dexie
// 인스턴스)을 쓰므로 `DatasetRepository.write` 의 결과가 엔티티 조회에 그대로 보인다.
//
// memory 쪽(`createMemoryRepositories`)과 달리 인자가 없다: IndexedDB 는 브라우저마다 DB 가 하나이고
// 격리는 테이블 비우기(`clear`)로 한다 — 계약 테스트의 `ContractTarget.create()` 가 그렇게 한다.
import type { Repositories } from '@/repositories/container';

import { createIndexedDbCategoryRepository } from '@/infra/indexeddb/category-indexeddb-repository';
import { createIndexedDbDatasetRepository } from '@/infra/indexeddb/dataset-indexeddb-repository';
import { createIndexedDbFocusSessionRepository } from '@/infra/indexeddb/focus-session-indexeddb-repository';
import { createIndexedDbSettingsRepository } from '@/infra/indexeddb/settings-indexeddb-repository';
import { createIndexedDbTodoRepository } from '@/infra/indexeddb/todo-indexeddb-repository';

/** 앱이 쓰는 IndexedDB 구현 한 벌. 조립은 `src/app/providers.tsx` 가 한다(ADR-0006 규칙 6). */
export function createIndexedDbRepositories(): Repositories {
  return {
    todos: createIndexedDbTodoRepository(),
    categories: createIndexedDbCategoryRepository(),
    settings: createIndexedDbSettingsRepository(),
    focusSessions: createIndexedDbFocusSessionRepository(),
    dataset: createIndexedDbDatasetRepository(),
  };
}
