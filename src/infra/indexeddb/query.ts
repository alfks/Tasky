// IndexedDB 조회·쓰기 헬퍼. db.ts 의 테이블에 닿는 유일한 파일이며, 툼스톤 필터도 여기 하나뿐이다(ADR-0007 결정 5).
import { type EntityTable, type IDType } from 'dexie';

import { isTombstone, type Meta, type Persistable } from '@/domain/meta';

import { db } from '@/infra/indexeddb/db';

/** 레포지토리 구현이 쓰는 테이블 묶음. db.ts 를 직접 import 하지 않게 하는 통로다. */
export const tables = {
  todos: db.todos,
  categories: db.categories,
  settings: db.settings,
};

/** 툼스톤을 제외한 전체 조회. */
export async function liveAll<T extends Meta>(table: EntityTable<T, 'id'>): Promise<T[]> {
  const rows = await table.toArray();
  return rows.filter((row) => !isTombstone(row));
}

/** 툼스톤을 제외한 단건 조회. 없거나 삭제됐으면 undefined. */
export async function liveOne<T extends Meta>(
  table: EntityTable<T, 'id'>,
  id: IDType<T, 'id'>,
): Promise<T | undefined> {
  const row = await table.get(id);
  return row !== undefined && !isTombstone(row) ? row : undefined;
}

/** 도메인 함수가 만든 값만 저장한다(브랜드로 강제). */
export async function put<T extends Meta>(
  table: EntityTable<T, 'id'>,
  entity: Persistable<T>,
): Promise<void> {
  await table.put(entity);
}
