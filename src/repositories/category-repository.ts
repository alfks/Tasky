// 카테고리 저장소 계약.
import type { Category } from '@/domain/category/category';
import type { Persistable } from '@/domain/meta';

/** 카테고리 저장소. 조회는 툼스톤을 반환하지 않는다 (ADR-0007). */
export interface CategoryRepository {
  /** id 로 한 건 조회. 없거나 툼스톤이면 undefined. */
  getById(id: string): Promise<Category | undefined>;
  /** 모든 카테고리(툼스톤 제외). */
  listAll(): Promise<Category[]>;
  /** 도메인 함수가 만든 값만 저장한다. */
  upsert(category: Persistable<Category>): Promise<void>;
}
