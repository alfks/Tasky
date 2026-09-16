// 카테고리 저장소 계약 (TECH_PLAN §6).
//
// `list()` 는 기본이 활성만이고 `includeClosed` 로 종료(completed·paused)까지 넓힌다. 어느 옵션으로도
// 툼스톤은 나오지 않는다 — `includeDeleted` 는 없고, 툼스톤을 읽는 유일한 경로는
// `DatasetRepository.readAll()` 이다(ADR-0007 결정 4, ADR-0009 규칙 4).
import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';
import type { Persistable } from '@/domain/meta';

/** 카테고리 저장소. 조회는 툼스톤을 반환하지 않는다 (ADR-0007). */
export interface CategoryRepository {
  /** id 로 한 건. 없거나 툼스톤이면 `undefined`. */
  getById(id: CategoryId): Promise<Category | undefined>;
  /**
   * 기본은 활성만 `order` 오름차순(동률 `createdAt` → `id`).
   * `includeClosed` 면 활성 뒤에 종료된 것을 `closedAt` 내림차순으로 잇는다 (category R8).
   */
  list(options?: { includeClosed?: boolean }): Promise<Category[]>;
  /** 도메인 함수가 만든 값만 저장한다. 삭제는 `markDeleted` 의 결과를 넘긴다. */
  upsert(category: Persistable<Category>): Promise<void>;
}
