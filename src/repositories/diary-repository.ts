// 다이어리 저장소 계약 (diary.md §4).
//
// `getByDate` 가 **유일한 비-PK 조회**다 — `diaryEntries: 'id, date'` 인덱스가 그 한 조회를 감당한다.
// 유일성(diary R1)은 이 저장소가 아니라 도메인(`diary.rules.ts#createDiaryEntry`)이 지킨다 — 인덱스가
// 유일 인덱스(`&date`)가 아닌 이유는 소프트 삭제 툼스톤이 같은 `date` 로 남기 때문이다(ADR-0002·0007).
// `list()` 는 날짜 스트립의 기분 점(diary R6, 선택 항목·이 티켓 범위 밖)을 위해 시그니처만 미리 연다 —
// 나중에 더하면 "저장소 인터페이스 시그니처 변경 = ADR"(docs/decisions/AGENTS.md)이기 때문이다.
import type { DateKey } from '@/domain/date/date-key';
import type { DiaryEntry } from '@/domain/diary/diary-entry';
import type { Persistable } from '@/domain/meta';

/** 다이어리 저장소. `upsert` 하나로 생성·수정·삭제(소프트)·되돌리기를 전부 표현한다 (ADR-0007). */
export interface DiaryRepository {
  /**
   * 그 날짜의 살아 있는 기록. 스펙상 최대 1개(diary R1)지만 데이터가 어긋나도 두 구현이 갈리지
   * 않도록 `compareDiaryEntries`(createdAt asc → id asc)의 **첫 번째**를 돌려준다. 없으면 undefined.
   */
  getByDate(date: DateKey): Promise<DiaryEntry | undefined>;
  /** 살아 있는 전부(date asc → id asc). 날짜 스트립 점(diary R6)용 — 이 티켓은 부르지 않는다. */
  list(): Promise<DiaryEntry[]>;
  /** 도메인 함수가 만든 값만 저장한다. 삭제는 `markDeleted`(또는 되돌리기의 `touch`)의 결과를 넘긴다. */
  upsert(entry: Persistable<DiaryEntry>): Promise<void>;
}
