// memory 다이어리 저장소.
//
// **`MemoryTables`(live.ts) 의 `diaryEntries` 를 쓴다** — `memory/dday-repository.ts` 와 같은 이유다
// (백업/복원이 그 묶음만 보므로, T-86 부터는 엔티티 저장소도 같은 인스턴스를 써야 한다).
import type { DateKey } from '@/domain/date/date-key';
import { compareDiaryEntries, sortDiaryEntriesByDate } from '@/domain/diary/diary.rules';

import type { DiaryRepository } from '@/repositories/diary-repository';
import { liveAll, liveBy, put, type MemoryTables } from '@/repositories/memory/live';

/** 주어진 테이블 묶음 위에서 동작하는 다이어리 저장소. `tables` 는 `DatasetRepository`(같은 묶음)와 공유한다. */
export function createMemoryDiaryRepository(tables: MemoryTables): DiaryRepository {
  const table = tables.diaryEntries;
  return {
    getByDate: async (date: DateKey) => {
      const rows = await liveBy(table, 'date', date);
      return rows.length === 0 ? undefined : [...rows].sort(compareDiaryEntries)[0];
    },
    list: async () => sortDiaryEntriesByDate(await liveAll(table)),
    upsert: (entry) => put(table, entry),
  };
}
