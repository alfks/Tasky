import { beforeEach, describe, expect, it } from 'vitest';

import type { Category } from '@/domain/category/category';
import { createMeta, markDeleted, type Meta, type MetaDeps } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import { db, STORES } from '@/infra/indexeddb/db';
import {
  liveAll,
  liveBetween,
  liveBy,
  liveOne,
  liveOrderBy,
  put,
  tables,
} from '@/infra/indexeddb/query';

let seq = 0;
const deps: MetaDeps = {
  now: () => '2026-01-15T00:00:00.000Z',
  id: () => `id-${++seq}`,
};

const todo = (fields: Partial<Omit<Todo, keyof Meta>> = {}) =>
  createMeta<Todo>(deps, {
    categoryId: 'cat-1',
    date: '2026-01-15',
    title: '할 일',
    done: false,
    order: 0,
    ...fields,
  });

const category = (name: string, order: number) =>
  createMeta<Category>(deps, { name, color: '#000', order });

beforeEach(async () => {
  seq = 0;
  await db.todos.clear();
  await db.categories.clear();
});

describe('인덱스 선언과 조회 헬퍼의 일치', () => {
  it('STORES 문자열에서 뽑은 인덱스 이름이 Dexie 가 실제로 만든 인덱스와 같다', () => {
    const declared = STORES.todos
      .split(',')
      .map((part) => part.trim())
      .slice(1);

    expect(db.todos.schema.primKey.name).toBe('id');
    expect(db.todos.schema.indexes.map((index) => index.name).sort()).toEqual(declared.sort());
  });
});

describe('liveBy', () => {
  it('단일 인덱스로 좁혀 조회하고 툼스톤은 빼고 돌려준다', async () => {
    await put(tables.todos, todo({ date: '2026-01-15' }));
    await put(tables.todos, todo({ date: '2026-01-16' }));
    const deleted = todo({ date: '2026-01-15' });
    await put(tables.todos, markDeleted(deleted, '2026-01-15T01:00:00.000Z'));

    const rows = await liveBy(tables.todos, 'date', '2026-01-15');

    expect(rows.map((r) => r.id)).toEqual(['id-1']);
  });

  it('복합 인덱스는 키를 배열로 받는다', async () => {
    await put(tables.todos, todo({ categoryId: 'cat-1' }));
    await put(tables.todos, todo({ categoryId: 'cat-2' }));

    const rows = await liveBy(tables.todos, '[date+categoryId]', ['2026-01-15', 'cat-2']);

    expect(rows.map((r) => r.categoryId)).toEqual(['cat-2']);
  });
});

describe('liveBetween', () => {
  it('양끝을 포함하고 툼스톤은 뺀다', async () => {
    await put(tables.todos, todo({ date: '2026-01-14' }));
    await put(tables.todos, todo({ date: '2026-01-15' }));
    await put(tables.todos, todo({ date: '2026-01-16' }));
    await put(tables.todos, todo({ date: '2026-01-17' }));
    const gone = todo({ date: '2026-01-16' });
    await put(tables.todos, markDeleted(gone, '2026-01-16T01:00:00.000Z'));

    const rows = await liveBetween(tables.todos, 'date', '2026-01-14', '2026-01-16');

    expect(rows.map((r) => r.date).sort()).toEqual(['2026-01-14', '2026-01-15', '2026-01-16']);
  });
});

describe('liveOrderBy', () => {
  it('인덱스 순서로 정렬해 돌려주고 툼스톤은 뺀다', async () => {
    await put(tables.categories, category('세 번째', 3));
    await put(tables.categories, category('첫 번째', 1));
    await put(tables.categories, category('두 번째', 2));
    const gone = category('삭제됨', 4);
    await put(tables.categories, markDeleted(gone, '2026-01-15T01:00:00.000Z'));

    const rows = await liveOrderBy(tables.categories, 'order');

    expect(rows.map((r) => r.name)).toEqual(['첫 번째', '두 번째', '세 번째']);
  });
});

describe('liveOne · liveAll', () => {
  it('liveOne 은 툼스톤을 undefined 로 돌려준다', async () => {
    const alive = todo();
    await put(tables.todos, alive);
    const gone = todo();
    await put(tables.todos, markDeleted(gone, '2026-01-15T01:00:00.000Z'));

    await expect(liveOne(tables.todos, alive.id)).resolves.toMatchObject({ id: alive.id });
    await expect(liveOne(tables.todos, gone.id)).resolves.toBeUndefined();
    await expect(liveOne(tables.todos, '없는-id')).resolves.toBeUndefined();
  });

  it('liveAll 은 툼스톤을 뺀 전량을 돌려준다', async () => {
    await put(tables.todos, todo());
    await put(tables.todos, todo());
    const gone = todo();
    await put(tables.todos, markDeleted(gone, '2026-01-15T01:00:00.000Z'));

    await expect(liveAll(tables.todos)).resolves.toHaveLength(2);
  });
});
