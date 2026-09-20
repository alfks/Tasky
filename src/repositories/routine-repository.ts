// 루틴 저장소 계약 (routine.md §4).
//
// `list()`는 기본이 활성만이고 `includeInactive`로 중지된 것까지 넓힌다(category.md의
// `includeClosed`와 같은 모양). 어느 옵션으로도 툼스톤은 나오지 않는다(ADR-0007 결정 4).
// 인덱스는 `'id'`뿐이다(ADR-0016 정정 — `active`는 IndexedDB가 색인 못 하는 boolean) — `list()`는
// 전량을 읽고 메모리에서 거른다. 루틴은 수십 건 규모라 예산 안이다.
import type { RoutineId } from '@/domain/ids';
import type { Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';

/** 루틴 저장소. `upsert` 하나로 생성·수정·중지·재개·삭제(소프트)를 전부 표현한다 (ADR-0007). */
export interface RoutineRepository {
  /** id 로 한 건. 없거나 툼스톤이면 `undefined`. */
  getById(id: RoutineId): Promise<Routine | undefined>;
  /**
   * 기본은 `active: true` 만, `includeInactive`면 중지된 것까지(정렬은
   * `@/domain/routine/routine.rules#compareRoutines` — `createdAt` asc → `id` asc).
   */
  list(options?: { includeInactive?: boolean }): Promise<Routine[]>;
  /** 도메인 함수가 만든 값만 저장한다. 삭제는 `markDeleted`(또는 `deleteRoutine`)의 결과를 넘긴다. */
  upsert(routine: Persistable<Routine>): Promise<void>;
}
