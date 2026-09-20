// memory 다이어리 저장소.
//
// **다섯 저장소(todos·categories·settings·focusSessions·dataset)가 공유하는 `MemoryTables`(live.ts)
// 에 끼우지 않는다** — 다이어리는 `DatasetRepository`(백업/복원)에 아직 들어가지 않으므로(이 티켓
// 범위 밖, T-86) 다섯과 같은 상태를 공유해야 할 이유가 없다(`memory/dday-repository.ts`와 같은 판단).
// 대신 `live.ts` 가 이미 내보낸 **제네릭** 헬퍼(`liveAll`·`liveBy`·`put`)를 이 파일만의
// `MemoryTable<DiaryEntry>` 위에서 그대로 쓴다.
import type { DateKey } from '@/domain/date/date-key';
import type { DiaryEntry } from '@/domain/diary/diary-entry';
import { compareDiaryEntries, sortDiaryEntriesByDate } from '@/domain/diary/diary.rules';

import type { DiaryRepository } from '@/repositories/diary-repository';
import { liveAll, liveBy, put, type MemoryTable } from '@/repositories/memory/live';

/** 빈 테이블. 호출마다 새로 만들면 서로 격리된 저장소가 된다(계약 테스트가 기대하는 것). */
export function createMemoryDiaryTable(): MemoryTable<DiaryEntry> {
  return { rows: new Map<string, DiaryEntry>() };
}

/** 주어진 테이블 위에서 동작하는 다이어리 저장소. 인자를 생략하면 새 빈 테이블을 만든다. */
export function createMemoryDiaryRepository(
  table: MemoryTable<DiaryEntry> = createMemoryDiaryTable(),
): DiaryRepository {
  return {
    getByDate: async (date: DateKey) => {
      const rows = await liveBy(table, 'date', date);
      return rows.length === 0 ? undefined : [...rows].sort(compareDiaryEntries)[0];
    },
    list: async () => sortDiaryEntriesByDate(await liveAll(table)),
    upsert: (entry) => put(table, entry),
  };
}
