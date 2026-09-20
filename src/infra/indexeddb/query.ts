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
// 여기에 더해 `deletedByIds(table, ids)` 가 **툼스톤만** 돌려주는 유일한 엔티티 조회다(ADR-0014) —
// 이름에 `live` 가 없는 헬퍼는 전부 툼스톤을 감추지 않는다는 뜻이다.
//
// 아래 넷은 **`DatasetRepository` 전용 통로**다(ADR-0009 결정 2·4). 툼스톤을 감추지 않거나 물리 삭제를
// 하므로 엔티티 레포지토리 구현은 부르지 않는다 — 이름에 `live` 가 없는 것이 그 표식이다:
//   - allRows(table)                 툼스톤 **포함** 전량(id asc)        readAll
//   - clear(table)                   물리 삭제                           restore
//   - bulkPut(table, entities)       청크 쓰기                           restore
//   - store.transaction(run)         네 테이블 rw 트랜잭션               write · restore
//
// `Store` 는 다섯 테이블(D-day 신설로 넷에서 늘었다, ADR-0016)과 그 중 넷을 묶는 트랜잭션을 하나로
// 들고 있고, 레포지토리 구현이 그 묶음을 **주입받는다**(아래 `Store` 주석). `ddays` 는 아직
// `DatasetRepository`(백업/복원)에 들어가지 않으므로 트랜잭션에는 끼지 않는다 — 넷인 채로 남는다.
//
// `store.open()` 은 조회·쓰기가 아니라 **스키마를 여는** 통로다. Dexie 의 지연 오픈 때문에 업그레이드
// 실패가 아무 호출에서나 raw Dexie 에러로 터지는 것을 막고 `RepositoryError('SCHEMA_UPGRADE_FAILED')`
// 로 바꾼다(TECH_PLAN §5 규칙 4 — 아래 `Store.open` 주석).
import { type EntityTable, type IDType, type IndexableType } from 'dexie';

import type { Category } from '@/domain/category/category';
import type { Dday } from '@/domain/dday/dday';
import type { FocusSession } from '@/domain/focus/focus-session';
import { isTombstone, type Meta, type Persistable } from '@/domain/meta';
import type { Settings } from '@/domain/theme/settings';
import type { Todo } from '@/domain/todo/todo';

import { RepositoryError } from '@/repositories/repository-error';

import { createDb, db, STORES, type TaskyDb } from '@/infra/indexeddb/db';

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

/**
 * **한 Dexie 인스턴스**에 묶인 테이블 다섯과 그 중 넷을 묶는 트랜잭션. 레포지토리 구현이 db.ts 를
 * 직접 import 하지 않게 하는 통로이자, 구현이 어느 DB 위에서 도는지를 정하는 유일한 손잡이다.
 *
 * 묶음을 인자로 주고받는 이유는 **테스트 격리**다. IndexedDB 는 브라우저당 이름 하나에 DB 하나라,
 * 예전 계약 테스트처럼 "네 테이블을 비우고 같은 인스턴스를 다시 내주는" 방식은 격리가 아니라 전역
 * 리셋이었다(먼저 만든 묶음의 데이터까지 지워진다 — memory 구현과 의미가 갈리는 자리였다).
 * 지금은 `createStore()` 가 이름이 다른 DB 를 열어 주므로 두 묶음이 서로를 건드리지 않는다.
 */
export type Store = {
  readonly todos: LiveTable<Todo, IndexOf<typeof STORES.todos>>;
  readonly categories: LiveTable<Category, IndexOf<typeof STORES.categories>>;
  readonly settings: LiveTable<Settings, IndexOf<typeof STORES.settings>>;
  readonly focusSessions: LiveTable<FocusSession, IndexOf<typeof STORES.focusSessions>>;
  /**
   * D-day (ADR-0016, calendar.md). `DatasetRepository`(백업/복원, 아래 `transaction`)에는 아직 들어가지
   * 않는다 — `dday-repository.ts` 머리주석 참고.
   */
  readonly ddays: LiveTable<Dday, IndexOf<typeof STORES.ddays>>;
  /**
   * **`DatasetRepository.write`·`restore` 전용** — 이 묶음의 네 테이블을 묶는 rw 트랜잭션. 중간에 던지면
   * Dexie 가 전부 롤백한다(ADR-0009 결정 2 가 이 둘에만 허용한 예외).
   *
   * **`run` 안에서는 이 파일의 헬퍼만 부른다.** Dexie 트랜잭션은 존(zone)으로 동작해서, 콜백 안에서
   * Dexie 가 아닌 프라미스를 `await` 하면 그 사이에 트랜잭션이 커밋돼 버린다(조용한 실패). 값 검증처럼
   * Dexie 와 무관한 일은 트랜잭션에 **들어가기 전에** 끝낸다.
   */
  readonly transaction: (run: () => Promise<void>) => Promise<void>;
  /**
   * 이 묶음의 DB 를 **명시적으로** 연다. 실패는 `RepositoryError('SCHEMA_UPGRADE_FAILED')` 다
   * (TECH_PLAN §5 마이그레이션 규칙 4).
   *
   * 왜 필요한가: Dexie 는 첫 조회·쓰기에서야 DB 를 여는 **지연 오픈**이라, 버전업의 `upgrade`
   * 콜백이 던지면 그 실패가 하필 그때 돈 아무 호출(`todos.listByDate` 같은)에서 **raw Dexie 에러**
   * (`UpgradeError`)로 터진다. 호출처는 code 로 분기할 수 없고, 화면은 "할 일을 불러오지 못했어요"
   * 같은 엉뚱한 문구를 띄운다 — 실제로는 스키마가 올라가지 못해 **그 기기에서 아무것도 저장할 수 없는**
   * 상태다. 앱 셸은 이 code 를 보고 "백업 내보내기만 가능한 모드" 로 안내한다(app-shell §2-C).
   *
   * 멱등하다(Dexie `open()` 이 같은 프라미스를 돌려준다). 성공한 뒤에는 평소대로 지연 오픈과 구분되지 않는다.
   */
  readonly open: () => Promise<void>;
};

/** 열기 실패의 `detail` — **에러 이름만** 싣는다. 메시지에는 업그레이드 콜백이 넣은 값이 섞일 수 있다. */
function openFailureDetail(error: unknown): string {
  return `open 실패 name=${errorName(error) ?? typeof error}`;
}

function errorName(error: unknown): string | undefined {
  const name: unknown =
    typeof error === 'object' && error !== null ? (error as { name?: unknown }).name : undefined;
  return typeof name === 'string' ? name : undefined;
}

/**
 * **스키마와 무관한** 열기 실패의 Dexie 에러 이름. 이런 실패는 감싸지 않고 원본 그대로 올린다 —
 * `SCHEMA_UPGRADE_FAILED` 로 바꾸면 앱 셸이 "백업 내보내기만 가능한 모드"(스키마가 못 올라갔다는 뜻)를
 * **잘못** 띄운다.
 *
 * 왜 이 방향(허용 목록이 아니라 제외 목록)인가 — 실측이 그렇게 시켰다(fake-indexeddb, 탐침 4종):
 *   · 업그레이드 콜백이 던지면 Dexie 는 **콜백이 던진 에러를 그대로** 거절 값으로 준다(`name=Error`).
 *     즉 "업그레이드 실패" 를 이름으로 **알아볼 수 없다** — 허용 목록은 잡아야 할 그 케이스를 놓친다.
 *   · `indexedDB` 가 없으면(사생활 보호 모드) `MissingAPIError` 다 — 재현됨, 아래 목록에 있다.
 *   · 저장 버전이 선언보다 높은 롤백 배포는 이 하네스에서 **거절 자체가 나지 않았다**(fake-indexeddb 가
 *     낮은 선언으로도 열어 준다). 실제 브라우저의 `VersionError` 는 여기서 재현할 수 없어 목록에 넣지
 *     않았다 — 테스트 없는 분기를 추가하지 않는다는 뜻이다(PR #34 리뷰 라운드 1 Minor).
 * 전용 code(`DB_OPEN_FAILED`)를 두는 편이 더 낫지만 `repositories/repository-error.ts` 가 이 티켓
 * owns 밖이라 이번에는 원본을 그대로 올린다.
 */
const NOT_SCHEMA_FAILURES: ReadonlySet<string> = new Set([
  'MissingAPIError',
  'DatabaseClosedError',
]);

/**
 * 임의의 Dexie 인스턴스를 묶음으로 감싼다. 앱 코드는 아래 `tables` 하나만 쓰고, `createStore(name)` 와
 * **마이그레이션 실패를 주입한 인스턴스를 감싸는 테스트**(`migration.test.ts`)가 이 함수를 쓴다 —
 * 그래야 그 테스트가 검사하는 `open` 이 앱이 실제로 쓰는 바로 그 함수다.
 */
export function storeOn(database: TaskyDb): Store {
  return {
    todos: brand(database.todos, STORES.todos),
    categories: brand(database.categories, STORES.categories),
    settings: brand(database.settings, STORES.settings),
    focusSessions: brand(database.focusSessions, STORES.focusSessions),
    ddays: brand(database.ddays, STORES.ddays),
    transaction: (run) =>
      database.transaction(
        'rw',
        database.todos,
        database.categories,
        database.settings,
        database.focusSessions,
        run,
      ),
    open: async () => {
      try {
        await database.open();
      } catch (error) {
        const name = errorName(error);
        if (name !== undefined && NOT_SCHEMA_FAILURES.has(name)) {
          throw error;
        }
        throw new RepositoryError('SCHEMA_UPGRADE_FAILED', openFailureDetail(error));
      }
    },
  };
}

/** 앱이 쓰는 묶음(DB 이름 `tasky`). `createIndexedDbRepositories()` 의 기본값이다. */
export const tables: Store = storeOn(db);

/**
 * **이름이 다른 DB** 위의 별도 묶음. 테스트가 서로 격리된 저장소를 여러 개 만들 때만 쓴다 —
 * 앱 코드는 위 `tables` 하나만 쓴다(DB 가 여러 개 생기면 백업·마이그레이션의 단일 소스가 깨진다).
 */
export function createStore(name: string): Store {
  return storeOn(createDb(name));
}

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
 * **툼스톤 전용 조회**(ADR-0014) — `ids` 중 **툼스톤인 것만** `id` 오름차순으로. 기본 키 `bulkGet` 이라
 * 인덱스 전수 스캔이 없다. 살아 있는 로우는 나오지 않으므로 `liveOne`·`liveAll` 을 대신할 수 없고,
 * 이름에 `live` 가 없는 것이 "여기는 툼스톤이 나온다" 는 표식이다.
 * 호출처는 `CategoryRepository.listDeletedByIds` 하나다.
 */
export async function deletedByIds<T extends Meta>(
  table: LiveTable<T, string>,
  ids: readonly IDType<T, 'id'>[],
): Promise<T[]> {
  const rows = await raw(table).bulkGet([...ids]);
  return rows.filter((row): row is T => row !== undefined && isTombstone(row)).sort(byId);
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
