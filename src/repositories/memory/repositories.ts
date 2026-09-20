// memory 구현의 조립 지점. 한 번 호출할 때마다 **서로 격리된** 저장소 묶음이 나온다 —
// 다섯 저장소가 같은 테이블 묶음을 공유하므로 `DatasetRepository.write` 의 결과가 엔티티 조회에 보인다.
//
// `dday` 는 이 다섯에 끼지 않는다 — `DatasetRepository`(백업/복원) 에 아직 들어가지 않으므로
// `MemoryTables` 를 공유할 이유가 없다(memory/dday-repository.ts 머리주석). 그래서 `tables` 인자와
// 무관하게 호출마다 자기만의 빈 테이블을 새로 만든다.
import type { Repositories } from '@/repositories/container';
import { createMemoryCategoryRepository } from '@/repositories/memory/category-repository';
import { createMemoryDatasetRepository } from '@/repositories/memory/dataset-repository';
import { createMemoryDdayRepository } from '@/repositories/memory/dday-repository';
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
    dday: createMemoryDdayRepository(),
  };
}
