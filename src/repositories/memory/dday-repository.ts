// memory D-day 저장소.
//
// **다섯 저장소(todos·categories·settings·focusSessions·dataset)가 공유하는 `MemoryTables`(live.ts)
// 에 끼우지 않는다** — D-day 는 `DatasetRepository`(백업/복원)에 아직 들어가지 않으므로(이 티켓
// 범위 밖) 다섯과 같은 상태를 공유해야 할 이유가 없다. 대신 `live.ts` 가 이미 내보낸 **제네릭**
// 헬퍼(`liveAll`·`put`)를 이 파일만의 `MemoryTable<Dday>` 위에서 그대로 쓴다 — "memory 레포지토리는
// live.ts 의 함수 밖으로 테이블에 닿지 않는다"(live.ts 머리주석)는 관례를 그대로 지키면서도
// `live.ts`(이 티켓 owns 밖) 자체는 고치지 않는다.
import type { Dday } from '@/domain/dday/dday';

import type { DdayRepository } from '@/repositories/dday-repository';
import { liveAll, put, type MemoryTable } from '@/repositories/memory/live';

/** 빈 테이블. 호출마다 새로 만들면 서로 격리된 저장소가 된다(계약 테스트가 기대하는 것). */
export function createMemoryDdayTable(): MemoryTable<Dday> {
  return { rows: new Map<string, Dday>() };
}

/** 주어진 테이블 위에서 동작하는 D-day 저장소. 인자를 생략하면 새 빈 테이블을 만든다. */
export function createMemoryDdayRepository(
  table: MemoryTable<Dday> = createMemoryDdayTable(),
): DdayRepository {
  return {
    list: () => liveAll(table),
    upsert: (dday) => put(table, dday),
  };
}
