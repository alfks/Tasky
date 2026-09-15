import { describe, expect, it } from 'vitest';

import { createMeta, isTombstone, markDeleted, touch, type MetaDeps } from '@/domain/meta';
import type { Todo } from '@/domain/todo/todo';

import type { TodoRepository } from '@/repositories/todo-repository';

const T0 = '2026-01-15T00:00:00.000Z';
const T1 = '2026-01-15T09:30:00.000Z';

const deps: MetaDeps = { now: () => T0, id: () => 'todo-1' };

const makePlainTodo = (): Todo => ({
  id: 'todo-1',
  createdAt: T0,
  updatedAt: T0,
  rev: 1,
  categoryId: 'category-1',
  date: '2026-01-15',
  title: '아침 스트레칭',
  done: false,
  order: 0,
});

const noopRepository: TodoRepository = {
  getById: async () => undefined,
  listByDate: async () => [],
  listAll: async () => [],
  upsert: async () => undefined,
};

describe('createMeta', () => {
  it('주입한 시각과 ID 로 rev 1 의 Meta 를 만든다', () => {
    const meta = createMeta(deps);

    expect(meta.id).toBe('todo-1');
    expect(meta.createdAt).toBe(T0);
    expect(meta.updatedAt).toBe(T0);
    expect(meta.rev).toBe(1);
    expect(meta.deletedAt).toBeUndefined();
  });
});

describe('touch', () => {
  it('rev 를 정확히 1 올리고 updatedAt 을 주입한 시각으로 바꾼다', () => {
    const touched = touch(makePlainTodo(), T1);

    expect(touched.rev).toBe(2);
    expect(touched.updatedAt).toBe(T1);
  });

  it('createdAt 과 도메인 필드는 그대로 둔다', () => {
    const touched = touch(makePlainTodo(), T1);

    expect(touched.createdAt).toBe(T0);
    expect(touched.title).toBe('아침 스트레칭');
    expect(touched.done).toBe(false);
  });

  it('원본을 변경하지 않는다', () => {
    const todo = makePlainTodo();
    touch(todo, T1);

    expect(todo.rev).toBe(1);
    expect(todo.updatedAt).toBe(T0);
  });
});

describe('markDeleted', () => {
  it('deletedAt 을 설정하고 함께 touch 한다', () => {
    const deleted = markDeleted(makePlainTodo(), T1);

    expect(deleted.deletedAt).toBe(T1);
    expect(deleted.updatedAt).toBe(T1);
    expect(deleted.rev).toBe(2);
  });
});

describe('isTombstone', () => {
  it('deletedAt 이 있으면 툼스톤으로 판정한다', () => {
    expect(isTombstone(makePlainTodo())).toBe(false);
    expect(isTombstone(markDeleted(makePlainTodo(), T1))).toBe(true);
  });
});

describe('Persistable 브랜드', () => {
  it('도메인 함수를 거친 값만 upsert 에 넘길 수 있다', async () => {
    const plain = makePlainTodo();

    // @ts-expect-error 브랜드 없는 Todo 는 upsert 할 수 없다 (ADR-0007 규칙 3-d, TS2345)
    await noopRepository.upsert(plain);

    await expect(noopRepository.upsert(touch(plain, T1))).resolves.toBeUndefined();
    await expect(noopRepository.upsert(markDeleted(plain, T1))).resolves.toBeUndefined();
  });
});
