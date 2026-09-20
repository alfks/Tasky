// memory D-day 저장소.
//
// **`MemoryTables`(live.ts) 의 `ddays` 를 쓴다** — 백업/복원(`DatasetRepository.readAll`/`restore`)이
// 이 묶음만 보므로(T-86), 엔티티 저장소가 다른 테이블 인스턴스를 쓰면 두 경로가 서로 다른 상태를
// 본다(예전에는 독립 테이블이었다 — `memory/repositories.ts` 옛 머리주석 참고, live.ts 의 `MemoryTables`
// 주석이 그 이유를 적어 둔다).
import type { DdayRepository } from '@/repositories/dday-repository';
import { liveAll, put, type MemoryTables } from '@/repositories/memory/live';

/** 주어진 테이블 묶음 위에서 동작하는 D-day 저장소. `tables` 는 `DatasetRepository`(같은 묶음)와 공유한다. */
export function createMemoryDdayRepository(tables: MemoryTables): DdayRepository {
  const table = tables.ddays;
  return {
    list: () => liveAll(table),
    upsert: (dday) => put(table, dday),
  };
}
