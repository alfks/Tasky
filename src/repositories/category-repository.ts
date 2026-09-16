// 카테고리 저장소 계약 (TECH_PLAN §6).
//
// `list()` 는 기본이 활성만이고 `includeClosed` 로 종료(completed·paused)까지 넓힌다. 어느 옵션으로도
// 툼스톤은 나오지 않는다 — `includeDeleted` 같은 플래그는 없다(ADR-0007 결정 4).
// 툼스톤을 보려면 **이름이 그렇게 말하는 별도 메서드** `listDeletedByIds` 를 쓴다(ADR-0014).
import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';
import type { Persistable } from '@/domain/meta';

/** 카테고리 저장소. `listDeletedByIds` 를 뺀 모든 조회는 툼스톤을 반환하지 않는다 (ADR-0007·0014). */
export interface CategoryRepository {
  /** id 로 한 건. 없거나 툼스톤이면 `undefined`. */
  getById(id: CategoryId): Promise<Category | undefined>;
  /**
   * 기본은 활성만 `order` 오름차순(동률 `createdAt` → `id`).
   * `includeClosed` 면 활성 뒤에 종료된 것을 `closedAt` 내림차순으로 잇는다 (category R8).
   */
  list(options?: { includeClosed?: boolean }): Promise<Category[]>;
  /**
   * 주어진 id 중 **툼스톤인 것만** `id` 오름차순으로 (ADR-0014, date-strip R7).
   *
   * 살아 있는 로우는 이 메서드로 **절대** 나오지 않는다 — 그래서 일반 조회를 대신할 수 없고,
   * 호출처는 이미 `list()` 로 못 찾은 id 만 물어보게 된다. 지워진 카테고리에 달린 투두의 색을
   * 복원하는 것이 유일한 용도다("카테고리를 지워도 이미 체크한 투두는 남는다").
   */
  listDeletedByIds(ids: readonly CategoryId[]): Promise<Category[]>;
  /** 도메인 함수가 만든 값만 저장한다. 삭제는 `markDeleted` 의 결과를 넘긴다. */
  upsert(category: Persistable<Category>): Promise<void>;
}
