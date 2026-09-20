// D-day 저장소 계약 (calendar.md §4).
//
// 조회는 `list()` 하나뿐이다 — 날짜 그리드·주간/월간 요약처럼 date-strip 이 이미 하는 조회를 이
// 저장소가 다시 만들지 않는다(calendar.md §4). 정렬·D-n 계산은 도메인(`@/domain/dday/dday.rules`)이
// 전량을 받아 메모리에서 한다. 최대 50개(calendar R1)라 인덱스 없이도 예산 안이다(ADR-0016 §결정 1).
import type { Dday } from '@/domain/dday/dday';
import type { Persistable } from '@/domain/meta';

/** D-day 저장소. `upsert` 하나로 생성·삭제(소프트)·되돌리기를 전부 표현한다 (ADR-0007). */
export interface DdayRepository {
  /** 전량(툼스톤 제외). 정렬은 호출부가 도메인 함수로 한다. */
  list(): Promise<Dday[]>;
  /** 도메인 함수가 만든 값만 저장한다. 삭제는 `markDeleted`(또는 되돌리기의 `touch`) 의 결과를 넘긴다. */
  upsert(dday: Persistable<Dday>): Promise<void>;
}
