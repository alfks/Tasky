// memory 구현의 조립 지점. 한 번 호출할 때마다 **서로 격리된** 저장소 묶음이 나온다 —
// 다섯 저장소가 같은 테이블 묶음을 공유하므로 `DatasetRepository.write` 의 결과가 엔티티 조회에 보인다.
//
// `dday` 는 `tables`(`MemoryTables`) 에 끼지 않는다 — `DatasetRepository`(백업/복원) 에 아직
// 들어가지 않으므로 그 다섯과 같은 상태를 공유할 이유가 없다(memory/dday-repository.ts 머리주석).
// `MemoryTables` 타입 자체를 고치는 것(live.ts)은 이 티켓 owns 밖이라, 대신 **별도의 선택 인자**
// `ddayTable` 을 둔다 — 기본값은 매번 새 빈 테이블이라 한 인자만 쓰는 기존 호출은 전부 그대로 격리된다.
// 둘을 같은 dday 상태로 묶어야 하는 호출(리뷰 라운드 1 Minor-6 이 지적한 "공유 tables 로 두 묶음을
// 만드는" 패턴, 예: `CategoryRemoveDialog.test.tsx`)은 **같은 `ddayTable` 객체를 두 호출에 넘기면** 된다
// (`createMemoryDdayTable()` 로 하나 만들어 공유).
import type { Dday } from '@/domain/dday/dday';

import type { Repositories } from '@/repositories/container';
import { createMemoryCategoryRepository } from '@/repositories/memory/category-repository';
import { createMemoryDatasetRepository } from '@/repositories/memory/dataset-repository';
import {
  createMemoryDdayRepository,
  createMemoryDdayTable,
} from '@/repositories/memory/dday-repository';
import { createMemoryFocusSessionRepository } from '@/repositories/memory/focus-session-repository';
import {
  createMemoryTables,
  type MemoryTable,
  type MemoryTables,
} from '@/repositories/memory/live';
import { createMemorySettingsRepository } from '@/repositories/memory/settings-repository';
import { createMemoryTodoRepository } from '@/repositories/memory/todo-repository';

/**
 * 테스트·개발용 인메모리 구현 한 벌. `tables` 를 넘기면 그 상태를 공유한다.
 *
 * `ddayTable` 은 별도 인자다(위 머리주석) — 두 `createMemoryRepositories` 호출이 같은 dday 상태를
 * 봐야 하면 같은 `MemoryTable<Dday>` 객체를 양쪽에 넘긴다.
 */
export function createMemoryRepositories(
  tables: MemoryTables = createMemoryTables(),
  ddayTable: MemoryTable<Dday> = createMemoryDdayTable(),
): Repositories {
  return {
    todos: createMemoryTodoRepository(tables),
    categories: createMemoryCategoryRepository(tables),
    settings: createMemorySettingsRepository(tables),
    focusSessions: createMemoryFocusSessionRepository(tables),
    dataset: createMemoryDatasetRepository(tables),
    dday: createMemoryDdayRepository(ddayTable),
  };
}
