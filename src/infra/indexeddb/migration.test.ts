// v1 → v2 마이그레이션 테스트 (TECH_PLAN §5 규칙 5, ADR-0011). fake-indexeddb 로 **v1 스키마의 DB 를 먼저
// 만들고**, 그 위에서 앱의 `db`(v2)를 열어 업그레이드 경로를 실제로 밟는다.
//
// db.ts 가 `.upgrade()` 없이 인덱스를 늘려도 되는 근거("IndexedDB 가 기존 로우를 자동 재색인한다")를
// 주석으로만 두지 않고 여기서 측정한다 — v1 로 넣은 카테고리가 v2 에서 새 `status` 인덱스로 조회되는가.
import Dexie from 'dexie';
import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import { createMeta, type MetaDeps } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { db, DB_VERSION, STORES, STORES_V1 } from '@/infra/indexeddb/db';

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

  it('열린 스키마의 인덱스가 STORES 선언과 정확히 일치한다 (네 테이블 전부)', async () => {
    await seedV1();

    await db.open();

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
  });
});
