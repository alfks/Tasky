// v1 → v2 마이그레이션 테스트 (TECH_PLAN §5 규칙 5, ADR-0011). fake-indexeddb 로 **v1 스키마의 DB 를 먼저
// 만들고**, 그 위에서 앱의 `db`(v2)를 열어 업그레이드 경로를 실제로 밟는다.
//
// db.ts 가 `.upgrade()` 없이 인덱스를 늘려도 되는 근거("IndexedDB 가 기존 로우를 자동 재색인한다")를
// 주석으로만 두지 않고 여기서 측정한다 — v1 로 넣은 카테고리가 v2 에서 새 `status` 인덱스로 조회되는가.
import Dexie from 'dexie';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import { createMeta, type MetaDeps } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { isRepositoryError, type RepositoryError } from '@/repositories/repository-error';

import { db, DB_VERSION, STORES, STORES_V1, STORES_V2, type TaskyDb } from '@/infra/indexeddb/db';
import { storeOn } from '@/infra/indexeddb/query';

let seq = 0;
const deps: MetaDeps = {
  now: () => '2026-01-15T00:00:00.000Z',
  id: () => `f0000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`,
};

const V1_TODO = () =>
  createMeta<Todo>(deps, {
    categoryId: 'c-1',
    date: '2026-01-15',
    title: 'v1 에서 넣은 할 일',
    done: false,
    order: 0,
  });
const V1_CATEGORY = () =>
  createMeta<Category>(deps, { name: '공부', color: '#000', order: 0, status: 'paused' });

/** v1 스키마로만 아는 별도 Dexie 인스턴스. 같은 DB 이름을 v1 로 만들어 두는 것이 이 테스트의 전제다. */
async function seedV1(): Promise<{ todo: Todo; category: Category }> {
  const legacy = new Dexie('tasky');
  legacy.version(1).stores(STORES_V1);
  await legacy.open();
  expect(legacy.verno, 'v1 DB 로 시작하지 않았다 — 이 테스트는 업그레이드를 밟지 않는다').toBe(1);
  const todo = V1_TODO();
  const category = V1_CATEGORY();
  await legacy.table('todos').put(todo);
  await legacy.table('categories').put(category);
  legacy.close();
  return { todo, category };
}

/** v2 스키마로만 아는 별도 Dexie 인스턴스(ADR-0016 §결정 4 — v1 블록도 함께 선언해 실제 업그레이드 경로를 밟는다). */
async function seedV2(): Promise<{ todo: Todo; category: Category }> {
  const legacy = new Dexie('tasky');
  legacy.version(1).stores(STORES_V1);
  legacy.version(2).stores(STORES_V2);
  await legacy.open();
  expect(legacy.verno, 'v2 DB 로 시작하지 않았다 — 이 테스트는 v3 업그레이드를 밟지 않는다').toBe(
    2,
  );
  const todo = V1_TODO();
  const category = V1_CATEGORY();
  await legacy.table('todos').put(todo);
  await legacy.table('categories').put(category);
  legacy.close();
  return { todo, category };
}

describe('스키마 v1 → v2 업그레이드 (ADR-0011)', () => {
  // **DB 를 매번 지운다.** 지우지 않으면 첫 테스트가 올려놓은 v2 DB 위에서 `seedV1()` 이 돌고
  // (Dexie 는 낮은 버전 선언으로 열어도 기존 버전을 그대로 쓴다) 이후 테스트는 업그레이드를
  // 한 번도 밟지 않은 채 통과한다 — 실측으로 확인한 함정이라 여기 적어 둔다.
  beforeEach(async () => {
    db.close();
    await Dexie.delete('tasky');
    seq = 0;
  });

  it('v1 로 만들어진 DB 를 열면 v2 로 올라가고 기존 로우가 값 그대로 남는다', async () => {
    const { todo, category } = await seedV1();

    await db.open();

    expect(db.verno).toBe(DB_VERSION);
    expect(await db.todos.get(todo.id)).toEqual({ ...todo });
    expect(await db.categories.get(category.id)).toEqual({ ...category });
  });

  it('v2 에서 늘어난 인덱스는 v1 로 들어온 로우도 색인한다 — upgrade() 콜백이 필요 없는 근거', async () => {
    const { category } = await seedV1();

    await db.open();

    // 이 조회가 v1 시절 로우를 찾지 못하면 db.ts 의 "자동 재색인" 주석이 거짓이고 upgrade() 가 필요하다.
    const byStatus = await db.categories.where('status').equals('paused').toArray();
    expect(byStatus.map((row) => row.id)).toEqual([category.id]);
    const byUpdatedAt = await db.categories.where('updatedAt').equals(category.updatedAt).toArray();
    expect(byUpdatedAt).toHaveLength(1);
  });

  it('v2 에서 신설된 focusSessions 테이블은 비어 있고 곧바로 쓸 수 있다', async () => {
    await seedV1();

    await db.open();

    expect(await db.focusSessions.count()).toBe(0);
    expect(db.focusSessions.schema.primKey.name).toBe('id');
  });

  it('열린 스키마의 인덱스가 STORES 선언과 정확히 일치한다 (선언된 모든 테이블)', async () => {
    await seedV1();

    await db.open();

    assertIndexesMatchStores();
  });
});

/** `STORES`(현재 버전) 선언과 실제로 열린 스키마의 인덱스가 테이블마다 정확히 같은지 — 두 v2→v3 describe 블록이 공유한다. */
function assertIndexesMatchStores(): void {
  for (const [name, declaration] of Object.entries(STORES)) {
    const declared = declaration
      .split(',')
      .map((part) => part.trim())
      .slice(1)
      .sort();
    const actual = db
      .table(name)
      .schema.indexes.map((index) => index.name)
      .sort();
    expect(actual, `${name} 의 인덱스가 STORES 선언과 다르다`).toEqual(declared);
  }
}

describe('스키마 v2 → v3 업그레이드 (ADR-0016)', () => {
  // v1→v2 블록과 같은 함정: DB 를 지우지 않으면 첫 테스트가 올려놓은 v3 DB 위에서 seedV2() 가 돌아
  // 업그레이드를 밟지 않은 채 통과한다.
  beforeEach(async () => {
    db.close();
    await Dexie.delete('tasky');
    seq = 0;
  });

  it('v2 로 만들어진 DB 를 열면 v3 로 올라가고 기존 로우가 값 그대로 남는다', async () => {
    const { todo, category } = await seedV2();

    await db.open();

    expect(db.verno).toBe(DB_VERSION);
    expect(await db.todos.get(todo.id)).toEqual({ ...todo });
    expect(await db.categories.get(category.id)).toEqual({ ...category });
  });

  it('v3 에서 신설된 ddays·diaryEntries·routines 테이블은 비어 있고 곧바로 쓸 수 있다', async () => {
    await seedV2();

    await db.open();

    for (const name of ['ddays', 'diaryEntries', 'routines']) {
      expect(await db.table(name).count(), `${name} 은 비어 있어야 한다`).toBe(0);
      expect(db.table(name).schema.primKey.name, `${name} 의 기본 키는 id 다`).toBe('id');
    }
  });

  it('열린 스키마의 인덱스가 STORES 선언과 정확히 일치한다 (선언된 모든 테이블)', async () => {
    await seedV2();

    await db.open();

    assertIndexesMatchStores();
  });
});

/**
 * TECH_PLAN §5 규칙 4 — `upgrade` 실패는 `RepositoryError('SCHEMA_UPGRADE_FAILED')` 로 나가야 한다.
 *
 * **값 변환이 있는 버전업이 아직 없으므로 실패를 인위로 주입한다**: 던지는 `upgrade` 콜백을 단 v3 를
 * 선언한 별도 인스턴스를 만들고, 그 앞에 v2 로 열린 적 있는 DB 를 깔아 업그레이드 경로를 실제로 밟는다.
 * 여기서 도는 `open` 은 앱이 쓰는 바로 그 함수다(`storeOn` 은 `tables`·`createStore` 와 같은 통로).
 */
describe('스키마 업그레이드 실패 (TECH_PLAN §5 규칙 4)', () => {
  /** 거절된 값을 **그대로** 받는다 — `rejects.toThrow()` 로는 타입·code 를 볼 수 없다. */
  const catchValue = (error: unknown): unknown => error;
  const NAME = 'tasky-upgrade-fail';
  const BOOM = '업그레이드 콜백이 던진 문구';

  /** 이 describe 가 연 인스턴스 전부. 닫지 않으면 다음 `Dexie.delete` 가 연결을 강제로 끊는다. */
  let opened: TaskyDb[] = [];

  const declare = (database: TaskyDb): TaskyDb => {
    database.version(1).stores(STORES_V1);
    database.version(2).stores(STORES_V2);
    database.version(DB_VERSION).stores(STORES);
    opened.push(database);
    return database;
  };

  /** 현재 버전까지만 아는 정상 인스턴스. */
  const healthy = (): TaskyDb => declare(new Dexie(NAME) as TaskyDb);

  /** 다음 버전의 `upgrade` 가 던지는 인스턴스. */
  const broken = (): TaskyDb => {
    const database = declare(new Dexie(NAME) as TaskyDb);
    database
      .version(DB_VERSION + 1)
      .stores(STORES)
      .upgrade(() => {
        throw new Error(BOOM);
      });
    return database;
  };

  /** v2 로 만들어진 DB 를 깔아 둔다 — 이게 없으면 v3 는 새 DB 생성이라 upgrade 가 아예 돌지 않는다. */
  const seedCurrent = async (): Promise<void> => {
    const current = healthy();
    await current.open();
    expect(current.verno, '업그레이드 경로를 밟지 않는다').toBe(DB_VERSION);
    current.close();
  };

  beforeEach(async () => {
    opened = [];
    await Dexie.delete(NAME);
  });

  afterEach(() => {
    for (const database of opened) {
      database.close();
    }
  });

  it('업그레이드가 실패하면 open 은 RepositoryError(SCHEMA_UPGRADE_FAILED) 로 거절한다', async () => {
    await seedCurrent();

    const error: unknown = await storeOn(broken())
      .open()
      .then(() => undefined, catchValue);

    expect(isRepositoryError(error), `저장소 에러가 아니다: ${String(error)}`).toBe(true);
    expect((error as RepositoryError).code).toBe('SCHEMA_UPGRADE_FAILED');
  });

  it('detail 에 업그레이드 콜백의 메시지가 실리지 않는다 — 에러 이름만 남는다', async () => {
    await seedCurrent();

    const error = (await storeOn(broken())
      .open()
      .then(() => undefined, catchValue)) as RepositoryError;

    expect(error.detail).toContain('name=');
    expect(error.message).not.toContain(BOOM);
  });

  it('대조군 ① 정상 스키마의 open 은 성공한다 — 이 경로가 항상 던지는 게 아니다', async () => {
    await seedCurrent();

    await expect(storeOn(healthy()).open()).resolves.toBeUndefined();
  });

  it('스키마와 무관한 실패는 감싸지 않는다 — indexedDB 가 없으면 MissingAPIError 그대로다', async () => {
    // 사생활 보호 모드/차단. 이것을 SCHEMA_UPGRADE_FAILED 로 바꾸면 앱 셸이 "백업 내보내기만 가능한
    // 모드"(스키마가 못 올라갔다는 뜻)를 잘못 띄운다.
    const saved = Dexie.dependencies.indexedDB;
    // @ts-expect-error 실패 주입 — 테스트 계층이라 전역 조작이 허용된다.
    Dexie.dependencies.indexedDB = undefined;
    try {
      const error: unknown = await storeOn(healthy())
        .open()
        .then(() => undefined, catchValue);

      expect((error as Error).name).toBe('MissingAPIError');
      expect(isRepositoryError(error), '스키마 실패가 아닌데 저장소 에러로 감쌌다').toBe(false);
    } finally {
      Dexie.dependencies.indexedDB = saved;
    }
  });

  it('대조군 ② 지연 오픈으로 들어가면 같은 실패가 raw Dexie 에러로 샌다 — 그래서 명시적 open 이 있다', async () => {
    await seedCurrent();

    const leaked: unknown = await broken()
      .todos.toArray()
      .then(() => undefined, catchValue);

    expect(leaked).toBeInstanceOf(Error);
    expect(
      isRepositoryError(leaked),
      'raw Dexie 에러가 이미 감싸져 있다면 이 대조군은 의미가 없다',
    ).toBe(false);
  });
});
