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
//   - 쓰기            put(table, entity)                 브랜드가 붙은 값 한 건
// 인덱스를 타지 않는 정렬·필터(`done`, 부분 문자열 검색)는 위 헬퍼가 좁혀 준 배열 위에서 레포지토리가 한다.
//
// 아래 넷은 **`DatasetRepository` 전용 통로**다(ADR-0009 결정 2·4). 툼스톤을 감추지 않거나 물리 삭제를
// 하므로 엔티티 레포지토리 구현은 부르지 않는다 — 이름에 `live` 가 없는 것이 그 표식이다:
//   - allRows(table)                 툼스톤 **포함** 전량(id asc)        readAll
//   - clear(table)                   물리 삭제                           restore
//   - bulkPut(table, entities)       청크 쓰기                           restore
//   - transaction(run)               네 테이블 rw 트랜잭션               write · restore
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
  focusSessions: brand(db.focusSessions, STORES.focusSessions),
};

/** `id` 오름차순 비교. 두 구현(memory `allRows`)이 같은 순서를 내도록 여기서도 명시적으로 정렬한다. */
const byId = (a: Meta, b: Meta): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

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

/**
 * **`DatasetRepository.readAll` 전용** — 툼스톤을 **포함한** 전량을 `id` 오름차순으로 (ADR-0009 규칙 4).
 * IndexedDB 오브젝트 스토어는 기본 키 순서로 순회하지만, 순서를 계약으로 삼는 쪽이 memory 구현과
 * 갈리지 않도록 여기서 한 번 더 정렬한다(비용은 전량 읽기에 묻힌다).
 */
export async function allRows<T extends Meta>(table: LiveTable<T, string>): Promise<T[]> {
  return (await raw(table).toArray()).sort(byId);
}

/**
 * **`DatasetRepository.restore` 전용** — 테이블을 물리적으로 비운다. 앱에 물리 삭제가 있는 유일한 자리이며,
 * 뒤이어 들어가는 스냅샷이 툼스톤을 포함한 최종 전량이라 안전하다(ADR-0009 결정 4).
 * 계약 테스트의 `ContractTarget.create()`(빈 상태로 시작)도 이 함수를 쓴다.
 */
export async function clear<T extends Meta>(table: LiveTable<T, string>): Promise<void> {
  await raw(table).clear();
}

/** **`DatasetRepository.restore` 전용** — 브랜드가 붙은 로우 여러 건을 한 번에. 청크 크기는 호출처가 정한다. */
export async function bulkPut<T extends Meta>(
  table: LiveTable<T, string>,
  entities: readonly Persistable<T>[],
): Promise<void> {
  await raw(table).bulkPut([...entities]);
}

/**
 * **`DatasetRepository.write`·`restore` 전용** — 네 테이블을 묶는 rw 트랜잭션. 중간에 던지면 Dexie 가
 * 전부 롤백한다(ADR-0009 결정 2 가 이 둘에만 허용한 예외).
 *
 * **`run` 안에서는 이 파일의 헬퍼만 부른다.** Dexie 트랜잭션은 존(zone)으로 동작해서, 콜백 안에서
 * Dexie 가 아닌 프라미스를 `await` 하면 그 사이에 트랜잭션이 커밋돼 버린다(조용한 실패). 값 검증처럼
 * Dexie 와 무관한 일은 트랜잭션에 **들어가기 전에** 끝낸다 — 그래야 검증 실패에서도 부분 쓰기가 0 이다.
 */
export function transaction(run: () => Promise<void>): Promise<void> {
  return db.transaction('rw', db.todos, db.categories, db.settings, db.focusSessions, run);
}
