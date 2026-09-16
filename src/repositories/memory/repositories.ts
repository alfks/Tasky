// memory 구현의 조립 지점. 한 번 호출할 때마다 **서로 격리된** 저장소 묶음이 나온다 —
// 다섯 저장소가 같은 테이블 묶음을 공유하므로 `DatasetRepository.write` 의 결과가 엔티티 조회에 보인다.
import type { Repositories } from '@/repositories/container';
import { createMemoryCategoryRepository } from '@/repositories/memory/category-repository';
import { createMemoryDatasetRepository } from '@/repositories/memory/dataset-repository';
import { createMemoryFocusSessionRepository } from '@/repositories/memory/focus-session-repository';
import { createMemoryTables, type MemoryTables } from '@/repositories/memory/live';
import { createMemorySettingsRepository } from '@/repositories/memory/settings-repository';
import { createMemoryTodoRepository } from '@/repositories/memory/todo-repository';

/** 테스트·개발용 인메모리 구현 한 벌. `tables` 를 넘기면 그 상태를 공유한다. */
export function createMemoryRepositories(
  tables: MemoryTables = createMemoryTables(),
): Repositories {
  return {
    todos: createMemoryTodoRepository(tables),
    categories: createMemoryCategoryRepository(tables),
    settings: createMemorySettingsRepository(tables),
    focusSessions: createMemoryFocusSessionRepository(tables),
    dataset: createMemoryDatasetRepository(tables),
  };
}
