// IndexedDB 다이어리 저장소.
import { compareDiaryEntries, sortDiaryEntriesByDate } from '@/domain/diary/diary.rules';

import type { DiaryRepository } from '@/repositories/diary-repository';

import { liveAll, liveBy, put, type Store } from '@/infra/indexeddb/query';

/** Dexie 테이블 위에서 동작하는 다이어리 저장소. `getByDate` 는 `date` 인덱스를 탄다. */
export function createIndexedDbDiaryRepository(store: Store): DiaryRepository {
  const table = store.diaryEntries;
  return {
    getByDate: async (date) => {
      const rows = await liveBy(table, 'date', date);
      return rows.length === 0 ? undefined : [...rows].sort(compareDiaryEntries)[0];
    },
    list: async () => sortDiaryEntriesByDate(await liveAll(table)),
    upsert: (entry) => put(table, entry),
  };
}
