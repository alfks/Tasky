// IndexedDB 조회·쓰기 헬퍼. db.ts 의 테이블에 닿는 유일한 파일이며, 툼스톤 필터도 여기 하나뿐이다(ADR-0007 결정 5).
//
// 테이블 핸들은 raw Dexie `EntityTable` 이 아니라 브랜드 타입 `LiveTable` 로만 나간다. 레포지토리 구현이
// `table.where(...)` 를 직접 부를 수 없으므로 "툼스톤 필터를 빼먹을 수 있는 코드 경로가 하나뿐" 이라는
// ADR-0007 결정 5 가 린트가 아니라 **타입**으로 강제된다. 조회 패턴마다 아래 헬퍼가 인덱스를 태운다:
//   - 단건            liveOne(table, id)                 기본 키
//   - 동등 조회       liveBy(table, index, key)          listByDate · listByCategory · 복합 인덱스
//   - 범위 조회       liveBetween(table, index, a, b)    listByDateRange(양끝 포함)
//   - 정렬 조회       liveOrderBy(table, index)          order asc 목록
//   - 전량            liveAll(table)                     검색·통계처럼 인덱스를 탈 수 없는 경우만
// 인덱스를 타지 않는 정렬·필터(`done`, 부분 문자열 검색)는 위 헬퍼가 좁혀 준 배열 위에서 레포지토리가 한다.
import { type EntityTable, type IDType, type IndexableType } from 'dexie';

import { isTombstone, type Meta, type Persistable } from '@/domain/meta';

import { db, STORES } from '@/infra/indexeddb/db';

/** 런타임 흔적 없는 브랜드 키. LiveTable 은 실제로는 Dexie 테이블 그 자체다. */
declare const LIVE_TABLE: unique symbol;

type TrimLeft<S extends string> = S extends ` ${infer R}` ? TrimLeft<R> : S;
type SplitStores<S extends string> = S extends `${infer H},${infer R}`
  ? TrimLeft<H> | SplitStores<R>
  : TrimLeft<S>;

/** 스토어 선언 문자열(db.ts STORES)에서 조회에 쓸 수 있는 인덱스 이름만 뽑는다. 첫 항목 'id' 는 기본 키다. */
export type IndexOf<S extends string> = Exclude<SplitStores<S>, 'id'>;

/**
 * 레포지토리 구현이 받는 테이블 핸들. Dexie API 가 노출되지 않으므로 조회는 이 파일의 헬퍼로만 할 수 있다.
 * I 는 그 테이블에 선언된 인덱스 이름의 합집합이라, 없는 인덱스로 조회하면 컴파일 에러다.
 */
export type LiveTable<T extends Meta, I extends string> = {
  readonly [LIVE_TABLE]: { entity: T; index: I };
};

/** 인덱스 이름 → 그 인덱스의 키 타입. 복합 인덱스('[a+b]')는 엔티티의 키가 아니므로 배열을 받는다. */
type KeyOf<T, K extends string> = K extends keyof T ? T[K] : readonly IndexableType[];

const brand = <T extends Meta, S extends string>(
  table: EntityTable<T, 'id'>,
  _stores: S,
): LiveTable<T, IndexOf<S>> => table as unknown as LiveTable<T, IndexOf<S>>;

const raw = <T extends Meta>(table: LiveTable<T, string>): EntityTable<T, 'id'> =>
  table as unknown as EntityTable<T, 'id'>;

const live = <T extends Meta>(rows: T[]): T[] => rows.filter((row) => !isTombstone(row));

/** 레포지토리 구현이 쓰는 테이블 묶음. db.ts 를 직접 import 하지 않게 하는 통로다. */
export const tables = {
  todos: brand(db.todos, STORES.todos),
  categories: brand(db.categories, STORES.categories),
  settings: brand(db.settings, STORES.settings),
};

/** 툼스톤을 제외한 전체 조회. 인덱스를 탈 수 없는 조회(부분 문자열 검색·통계)에만 쓴다. */
export async function liveAll<T extends Meta>(table: LiveTable<T, string>): Promise<T[]> {
  return live(await raw(table).toArray());
}

/** 툼스톤을 제외한 단건 조회. 없거나 삭제됐으면 undefined. */
export async function liveOne<T extends Meta>(
  table: LiveTable<T, string>,
  id: IDType<T, 'id'>,
): Promise<T | undefined> {
  const row = await raw(table).get(id);
  return row !== undefined && !isTombstone(row) ? row : undefined;
}

/** 인덱스 동등 조회(툼스톤 제외). 복합 인덱스는 키를 배열로 넘긴다. */
export async function liveBy<T extends Meta, I extends string, K extends I>(
  table: LiveTable<T, I>,
  index: K,
  key: KeyOf<T, K>,
): Promise<T[]> {
  return live(
    await raw(table)
      .where(index)
      .equals(key as IndexableType)
      .toArray(),
  );
}

/** 인덱스 범위 조회(양끝 포함, 툼스톤 제외). */
export async function liveBetween<T extends Meta, I extends string, K extends I & keyof T & string>(
  table: LiveTable<T, I>,
  index: K,
  from: T[K],
  to: T[K],
): Promise<T[]> {
  return live(
    await raw(table)
      .where(index)
      .between(from as IndexableType, to as IndexableType, true, true)
      .toArray(),
  );
}

/** 인덱스 순서로 정렬한 전량 조회(툼스톤 제외). */
export async function liveOrderBy<T extends Meta, I extends string, K extends I>(
  table: LiveTable<T, I>,
  index: K,
): Promise<T[]> {
  return live(await raw(table).orderBy(index).toArray());
}

/** 도메인 함수가 만든 값만 저장한다(브랜드로 강제). */
export async function put<T extends Meta>(
  table: LiveTable<T, string>,
  entity: Persistable<T>,
): Promise<void> {
  await raw(table).put(entity);
}
