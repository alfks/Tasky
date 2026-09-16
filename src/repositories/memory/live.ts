// memory 구현의 테이블 핸들과 조회 헬퍼. **툼스톤 필터가 있는 유일한 곳**이다(ADR-0007 결정 5,
// code-style §5) — `infra/indexeddb/query.ts` 와 같은 이름·같은 의미의 헬퍼를 두어 두 구현이
// 같은 경로를 밟게 한다. memory 레포지토리 구현은 이 파일의 함수 밖으로 테이블에 닿지 않는다.
//
// 인덱스가 없는 저장소이므로 `liveBy`·`liveBetween`·`liveOrderBy` 는 배열 연산이지만, 시그니처와
// 필터 위치를 맞춰 두면 계약 테스트가 두 구현에서 같은 결과를 요구할 수 있다.
import type { Category } from '@/domain/category/category';
import type { FocusSession } from '@/domain/focus/focus-session';
import { isTombstone, type Meta, type Persistable } from '@/domain/meta';
import type { Settings } from '@/domain/theme/settings';
import type { Todo } from '@/domain/todo/todo';

/**
 * 한 테이블. **쓰기가 복사본을 넣는다**(`put`·`replaceRows`) — 호출자가 넘긴 객체를 나중에 변형해도
 * 저장소가 오염되지 않는다(계약이 단언한다). 읽기는 내부 객체를 그대로 돌려주므로 **IndexedDB 와
 * 격리 수준이 같지 않다**: 조회 결과를 변형하면 memory 에서만 저장소가 따라 바뀐다. 조회 결과는
 * 브랜드가 없어 그대로 `upsert` 할 수 없고(ADR-0007 규칙 3-d) 변형은 도메인 함수를 거치므로
 * 앱 경로에서는 일어나지 않지만, memory 한정의 차이라는 점을 여기 적어 둔다.
 */
export type MemoryTable<T extends Meta> = { readonly rows: Map<string, T> };

/** 네 테이블 묶음. 한 memory 인스턴스의 전체 상태다. */
export type MemoryTables = {
  todos: MemoryTable<Todo>;
  categories: MemoryTable<Category>;
  settings: MemoryTable<Settings>;
  focusSessions: MemoryTable<FocusSession>;
};

/** 빈 테이블 묶음. 테스트는 이것을 새로 만들어 격리한다. */
export function createMemoryTables(): MemoryTables {
  return {
    todos: { rows: new Map<string, Todo>() },
    categories: { rows: new Map<string, Category>() },
    settings: { rows: new Map<string, Settings>() },
    focusSessions: { rows: new Map<string, FocusSession>() },
  };
}

/**
 * 툼스톤 판정이 일어나는 **유일한 자리**. 아래 조회 헬퍼는 전부 이 함수를 거치므로 필터를 빼먹을 수
 * 있는 코드 경로가 하나뿐이다. `DatasetRepository` 전용 통로(`allRows`·`replaceRows`)만 이 밖에 있다.
 *
 * 단, memory 에서 그 "하나뿐" 은 **관례**다(AGENTS.md 규칙 3) — `MemoryTable.rows` 가 공개 `Map` 이라
 * `tables.todos.rows.get(id)` 로 툼스톤을 읽는 코드가 lint·tsc 를 통과한다. indexeddb 쪽은
 * `LiveTable` 브랜드가 Dexie API 를 감춰 타입이 강제한다(ADR-0007 결정 5).
 */
function live<T extends Meta>(table: MemoryTable<T>): T[] {
  return [...table.rows.values()].filter((row) => !isTombstone(row));
}

/** 툼스톤을 제외한 전체 조회. */
export async function liveAll<T extends Meta>(table: MemoryTable<T>): Promise<T[]> {
  return live(table);
}

/** 툼스톤을 제외한 단건 조회. 없거나 삭제됐으면 `undefined`. */
export async function liveOne<T extends Meta>(
  table: MemoryTable<T>,
  id: string,
): Promise<T | undefined> {
  const row = table.rows.get(id);
  return row !== undefined && !isTombstone(row) ? row : undefined;
}

/** 필드 동등 조회(툼스톤 제외). indexeddb 구현에서는 인덱스 동등 조회다. */
export async function liveBy<T extends Meta, K extends keyof T>(
  table: MemoryTable<T>,
  field: K,
  key: T[K],
): Promise<T[]> {
  return live(table).filter((row) => row[field] === key);
}

/** 필드 범위 조회(**양끝 포함**, 툼스톤 제외). */
export async function liveBetween<T extends Meta, K extends keyof T>(
  table: MemoryTable<T>,
  field: K,
  from: T[K],
  to: T[K],
): Promise<T[]> {
  return live(table).filter((row) => row[field] >= from && row[field] <= to);
}

/** 필드 오름차순 조회(툼스톤 제외). 동률은 `id` 로 끊어 두 구현이 갈리지 않게 한다. */
export async function liveOrderBy<T extends Meta, K extends keyof T>(
  table: MemoryTable<T>,
  field: K,
): Promise<T[]> {
  return live(table).sort((a, b) => {
    if (a[field] !== b[field]) {
      return a[field] < b[field] ? -1 : 1;
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** 도메인 함수가 만든 값만 저장한다(브랜드로 강제). 저장은 복사본으로 한다. */
export async function put<T extends Meta>(
  table: MemoryTable<T>,
  entity: Persistable<T>,
): Promise<void> {
  table.rows.set(entity.id, { ...entity });
}

/**
 * **툼스톤 전용 조회**(ADR-0014) — `ids` 중 **툼스톤인 것만** `id` 오름차순으로.
 * 살아 있는 로우는 나오지 않으므로 `liveOne`·`liveAll` 을 대신할 수 없다. 이름에 `live` 가 없는 것이
 * "여기는 툼스톤이 나온다" 는 표식이고, 호출처는 `CategoryRepository.listDeletedByIds` 하나다.
 */
export async function deletedByIds<T extends Meta>(
  table: MemoryTable<T>,
  ids: readonly string[],
): Promise<T[]> {
  const wanted = new Set<string>(ids);
  return [...table.rows.values()]
    .filter((row) => wanted.has(row.id) && isTombstone(row))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * **`DatasetRepository` 전용** — 툼스톤을 **포함한** 전량을 `id` 오름차순으로 (ADR-0009 규칙 4).
 * 엔티티 레포지토리 구현은 이 함수를 부르지 않는다.
 */
export function allRows<T extends Meta>(table: MemoryTable<T>): T[] {
  return [...table.rows.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/**
 * **`DatasetRepository.restore` 전용** — 테이블을 물리적으로 비우고 스냅샷으로 대체한다.
 * 앱에 물리 삭제가 있는 유일한 자리이며, 인자가 툼스톤을 포함한 최종 전량이라 안전하다(ADR-0009 결정 4).
 */
export function replaceRows<T extends Meta>(
  table: MemoryTable<T>,
  rows: readonly Persistable<T>[],
): void {
  table.rows.clear();
  for (const row of rows) {
    table.rows.set(row.id, { ...row });
  }
}
