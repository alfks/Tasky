// IndexedDB 구현의 조립 지점. 다섯 저장소가 **같은 `Store`**(= 하나의 Dexie 인스턴스)를 받으므로
// `DatasetRepository.write` 의 결과가 엔티티 조회에 그대로 보인다.
//
// 묶음을 인자로 받는 것이 memory 쪽(`createMemoryRepositories`)과의 유일한 차이이자, 계약 테스트가
// 호출마다 **서로 격리된** 묶음을 만들 수 있는 이유다(`query.ts` 의 `createStore` — 이름이 다른 DB 를 연다).
// 기본값은 앱 DB(`tasky`) 묶음이라 `src/app/providers.tsx` 는 인자 없이 부른다.
import type { Repositories } from '@/repositories/container';

import { createIndexedDbCategoryRepository } from '@/infra/indexeddb/category-indexeddb-repository';
import { createIndexedDbDatasetRepository } from '@/infra/indexeddb/dataset-indexeddb-repository';
import { createIndexedDbDdayRepository } from '@/infra/indexeddb/dday-indexeddb-repository';
import { createIndexedDbFocusSessionRepository } from '@/infra/indexeddb/focus-session-indexeddb-repository';
import { tables, type Store } from '@/infra/indexeddb/query';
import { createIndexedDbRoutineRepository } from '@/infra/indexeddb/routine-indexeddb-repository';
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
    dday: createIndexedDbDdayRepository(store),
    routines: createIndexedDbRoutineRepository(store),
  };
}

/**
 * 스키마를 **명시적으로** 연다 (TECH_PLAN §5 규칙 4). 조립 지점(`src/app/providers.tsx`)이 주입 직후
 * 한 번 부른다 — 그것이 이 함수의 유일한 호출처이고, `providers.test.tsx` 가 그 호출을 고정한다.
 *
 * 왜 조립과 붙어 있어야 하는가: Dexie 는 첫 조회·쓰기에서야 DB 를 여는 지연 오픈이라, 이 호출이 없으면
 * 업그레이드 실패가 **아무 호출에서나** raw Dexie 에러로 터진다. 화면은 "할 일을 불러오지 못했어요" 를
 * 띄우지만 실제로는 그 기기에서 아무것도 저장할 수 없는 상태다. 실패는
 * `RepositoryError('SCHEMA_UPGRADE_FAILED')` 로 나가고 조립 지점이 그 code 로 분기한다.
 */
export function openIndexedDb(store: Store = tables): Promise<void> {
  return store.open();
}
