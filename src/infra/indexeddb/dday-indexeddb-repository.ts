// IndexedDB D-day 저장소.
import type { DdayRepository } from '@/repositories/dday-repository';

import { liveAll, put, type Store } from '@/infra/indexeddb/query';

/** Dexie 테이블 위에서 동작하는 D-day 저장소. 정렬은 도메인(`dday.rules.ts#sortDdays`)이 한다. */
export function createIndexedDbDdayRepository(store: Store): DdayRepository {
  const table = store.ddays;
  return {
    list: () => liveAll(table),
    upsert: (dday) => put(table, dday),
  };
}
