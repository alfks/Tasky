// 집중 세션 저장소 계약 (TECH_PLAN §6, timer.md §4).
//
// 세션은 삭제하지 않지만(timer R13) `Meta` 공통 필드를 가지므로 조회 규칙은 다른 엔티티와 같다 —
// 툼스톤은 반환하지 않고 쓰기는 `upsert` 하나뿐이다(ADR-0007). 목록 정렬은 `@/repositories/ordering`
// 의 `compareFocusSessions`(`startedAt` asc → `createdAt` asc → `id` asc) 하나로 고정한다.
import type { DateKey } from '@/domain/date/date-key';
import type { FocusSession } from '@/domain/focus/focus-session';
import type { FocusSessionId, TodoId } from '@/domain/ids';
import type { Persistable } from '@/domain/meta';

/** 집중 세션 저장소. 조회는 툼스톤을 반환하지 않고, 쓰기는 `upsert` 하나뿐이다 (ADR-0007). */
export interface FocusSessionRepository {
  /**
   * 진행 중인 세션(`status ∈ running | paused`). 스펙상 최대 1개이지만(timer R5) 데이터가 어긋나도
   * 구현이 갈리지 않도록 **가장 늦게 시작한 것**(정렬의 마지막)을 돌려준다. 없으면 `undefined`.
   */
  getActive(): Promise<FocusSession | undefined>;
  /** id 로 한 건. 없거나 툼스톤이면 `undefined`. */
  getById(id: FocusSessionId): Promise<FocusSession | undefined>;
  /** 그 날짜에 시작한 세션 전부(정렬 고정). */
  listByDate(date: DateKey): Promise<FocusSession[]>;
  /** `from`~`to` **양끝 포함** 범위에 시작한 세션 전부(정렬 고정). 통계용(stats.md R7). */
  listByDateRange(from: DateKey, to: DateKey): Promise<FocusSession[]>;
  /** 그 투두에 연결된 세션 전부(정렬 고정). `focusSeconds` 캐시를 재계산하는 원천이다 (timer R8). */
  listByTodo(todoId: TodoId): Promise<FocusSession[]>;
  /** 전량(정렬 고정). 통계용. */
  listAll(): Promise<FocusSession[]>;
  /** 도메인 함수가 만든 값만 저장한다. */
  upsert(session: Persistable<FocusSession>): Promise<void>;
}
