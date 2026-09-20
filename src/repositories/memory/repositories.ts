// memory 구현의 조립 지점. 한 번 호출할 때마다 **서로 격리된** 저장소 묶음이 나온다 —
// 일곱 저장소가 같은 테이블 묶음을 공유하므로 `DatasetRepository.write`/`restore` 의 결과가 엔티티
// 조회에 보인다.
//
// `dday`·`diaryEntries` 는 T-86 전까지 `tables`(`MemoryTables`) 밖의 독립 테이블이었다(백업/복원에
// 들어가지 않았으므로 공유할 이유가 없었다) — 이제 `DatasetRepository.readAll`/`restore` 가 그 둘도
// 읽고 쓰므로, 엔티티 저장소가 다른 인스턴스를 보면 두 경로(화면 조회 vs 백업)가 갈린다. 그래서
// `routines` 와 같은 자리로 `tables` 에 합류시켰다(live.ts `MemoryTables` 주석) — 별도 `ddayTable`
// 인자는 더 없다(아무 호출부도 쓰지 않았다, git grep 실측).
import type { Repositories } from '@/repositories/container';
import { createMemoryCategoryRepository } from '@/repositories/memory/category-repository';
import { createMemoryDatasetRepository } from '@/repositories/memory/dataset-repository';
import { createMemoryDdayRepository } from '@/repositories/memory/dday-repository';
import { createMemoryDiaryRepository } from '@/repositories/memory/diary-repository';
import { createMemoryFocusSessionRepository } from '@/repositories/memory/focus-session-repository';
import { createMemoryTables, type MemoryTables } from '@/repositories/memory/live';
import { createMemoryRoutineRepository } from '@/repositories/memory/routine-repository';
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
    dday: createMemoryDdayRepository(tables),
    diaryEntries: createMemoryDiaryRepository(tables),
    routines: createMemoryRoutineRepository(tables),
  };
}
