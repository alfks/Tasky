import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Category } from '@/domain/category/category';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { createRemovalActions } from '@/features/category/store/category-removal';
import { createCategoryWriter } from '@/features/category/store/category-writes';
import * as fixture from '@/test/fixtures/category-removal';
import { fixedDeps } from '@/test/fixtures/deps';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const input = () => ({
  category: fixture.state().byId[fixture.공부.id],
  choice: { incomplete: 'delete' as const },
});
function replace(category: Category) {
  fixture.store.setState({ byId: { ...fixture.state().byId, [category.id]: category } });
}
beforeEach(fixture.setupRemovalFixture);

describe('canonical 삭제와 큐/계정 경계', () => {
  it('철회 뒤 최신 private/unbound 메모로 삭제하고 되돌리며 다른 최신 필드도 보존한다', async () => {
    replace({
      ...input().category,
      visibility: 'public',
      socialCategoryId: 'a'.repeat(32),
      socialCategoryVersion: 7,
    });
    await fixture.state().confirmAudience(fixture.공부.id, null);
    const canonical = { ...input().category, order: 8 };
    replace(canonical);
    expect(await fixture.state().removeCategory(input())).toBe(true);
    expect(fixture.state().pendingRemoval?.category).toEqual(canonical);
    expect(await fixture.state().undoRemoval()).toBe(true);
    const restored = fixture.state().byId[canonical.id];
    expect(restored.visibility).toBe('private');
    expect(restored.socialCategoryId).toBeUndefined();
    expect(restored.socialCategoryVersion).toBeUndefined();
    expect(restored.order).toBe(8);
    expect(fixture.row(fixture.공부_할일[0]).deletedAt).toBeUndefined();
  });

  it.each(['metadata', 'binding', 'restore'] as const)(
    'todo 읽기 중 %s 변경을 삭제 계획에 덮어쓰지 않는다',
    async (kind) => {
      const original = input();
      const gate = deferred<never[]>();
      const repositories = createMemoryRepositories(fixture.tables);
      const read = vi.fn(() => gate.promise);
      const write = vi.fn(repositories.dataset.write);
      setRepositories({
        ...repositories,
        todos: { ...repositories.todos, listByCategory: read },
        dataset: { ...repositories.dataset, write },
      });
      const deleting = fixture.state().removeCategory(original);
      await vi.waitFor(() => expect(read).toHaveBeenCalled());
      const changed =
        kind === 'metadata'
          ? { ...original.category, name: '복원된 이름' }
          : kind === 'binding'
            ? { ...original.category, visibility: 'public' as const, socialCategoryId: 'remote' }
            : { ...original.category, visibility: 'private' as const };
      replace(changed);
      gate.resolve([]);
      expect(await deleting).toBe(false);
      expect(write).not.toHaveBeenCalled();
      expect(fixture.state().byId[changed.id]).toBe(changed);
      expect(fixture.state().pendingRemoval).toBeNull();
    },
  );

  it('계획을 마친 뒤 write 차례 전 row 교체는 최신 순서를 덮어쓰지 않는다', async () => {
    const original = input();
    const gate = deferred<never[]>();
    const repositories = createMemoryRepositories(fixture.tables);
    const read = vi.fn(() => gate.promise);
    const write = vi.fn(repositories.dataset.write);
    setRepositories({
      ...repositories,
      todos: { ...repositories.todos, listByCategory: read },
      dataset: { ...repositories.dataset, write },
    });
    const deleting = fixture.state().removeCategory(original);
    await vi.waitFor(() => expect(read).toHaveBeenCalled());
    gate.resolve([]);
    queueMicrotask(() => replace({ ...original.category, order: 9 }));
    expect(await deleting).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(fixture.state().byId[original.category.id].order).toBe(9);
  });

  it('todo 읽기 전 큐 대기 중 계정이 바뀌면 계획/쓰기를 시작하지 않는다', async () => {
    const repositories = createMemoryRepositories(fixture.tables);
    const read = vi.spyOn(repositories.todos, 'listByCategory');
    setRepositories(repositories);
    const ctx = { get: fixture.store.getState, set: fixture.store.setState, deps: fixedDeps() };
    const writer = createCategoryWriter(ctx);
    const gate = deferred<void>();
    const first = writer.applyWrites(async () => {
      await gate.promise;
      return [];
    });
    let allowed = true;
    const deleting = createRemovalActions(ctx, writer).removeCategory({
      ...input(),
      allowed: () => allowed,
    });
    allowed = false;
    gate.resolve();
    await first;
    expect(await deleting).toBe(false);
    expect(read).not.toHaveBeenCalled();
    expect(fixture.state().pendingRemoval).toBeNull();
  });

  it.each([false, true])(
    'dataset write 종료 중 계정 변경 시 old 상태/메모/오류를 적용하지 않는다 (실패=%s)',
    async (failure) => {
      const repositories = createMemoryRepositories(fixture.tables);
      const gate = deferred<void>();
      const write = vi.fn(() => gate.promise);
      setRepositories({ ...repositories, dataset: { ...repositories.dataset, write } });
      let allowed = true;
      const deleting = fixture.state().removeCategory({ ...input(), allowed: () => allowed });
      await vi.waitFor(() => expect(write).toHaveBeenCalled());
      allowed = false;
      fixture.store.setState({ byId: {}, pendingRemoval: null, error: '새 계정 상태' });
      if (failure) gate.reject(new Error('old write 실패'));
      else gate.resolve();
      expect(await deleting).toBe(false);
      expect(fixture.state().byId).toEqual({});
      expect(fixture.state().pendingRemoval).toBeNull();
      expect(fixture.state().error).toBe('새 계정 상태');
    },
  );

  it('undo write 도중 계정 변경과 실패는 옛 메모를 되살리지 않는다', async () => {
    expect(await fixture.state().removeCategory(input())).toBe(true);
    const repositories = createMemoryRepositories(fixture.tables);
    const gate = deferred<void>();
    const write = vi.fn(() => gate.promise);
    setRepositories({ ...repositories, dataset: { ...repositories.dataset, write } });
    let allowed = true;
    const undo = fixture.state().undoRemoval(() => allowed);
    await vi.waitFor(() => expect(write).toHaveBeenCalled());
    allowed = false;
    fixture.store.setState({ byId: {}, pendingRemoval: null, error: '현재 계정' });
    gate.reject(new Error('old undo 실패'));
    expect(await undo).toBe(false);
    expect(fixture.state().byId).toEqual({});
    expect(fixture.state().pendingRemoval).toBeNull();
    expect(fixture.state().error).toBe('현재 계정');
  });

  it.each(['restore', 'rebind', 'created'] as const)(
    'undo 큐 대기 중 %s 변경은 새 row를 덮거나 지우지 않는다',
    async (kind) => {
      const repositories = createMemoryRepositories(fixture.tables);
      const write = vi.fn(repositories.dataset.write);
      setRepositories({ ...repositories, dataset: { ...repositories.dataset, write } });
      const ctx = { get: fixture.store.getState, set: fixture.store.setState, deps: fixedDeps() };
      const writer = createCategoryWriter(ctx);
      const actions = createRemovalActions(ctx, writer);
      const original = input().category;
      expect(
        await actions.removeCategory({
          category: original,
          choice:
            kind === 'created'
              ? { incomplete: 'create', name: '새 분류', color: '#CFEB8F' }
              : { incomplete: 'delete' },
        }),
      ).toBe(true);
      write.mockClear();
      const held = deferred<void>();
      const blocking = writer.applyWrites(async () => {
        await held.promise;
        return [];
      });
      const undo = actions.undoRemoval();
      const generated = fixture.state().pendingRemoval?.createdCategory;
      // undo는 시작과 동시에 memo 슬롯을 비우므로 generated row는 현재 목록에서 찾는다.
      const created =
        generated ?? Object.values(fixture.state().byId).find((item) => item.name === '새 분류');
      const changed =
        kind === 'created'
          ? {
              ...created!,
              name: '동기화한 새 분류',
              visibility: 'public' as const,
              socialCategoryId: 'remote',
            }
          : {
              ...original,
              visibility: kind === 'rebind' ? ('public' as const) : ('private' as const),
              ...(kind === 'rebind'
                ? { socialCategoryId: 'remote', socialCategoryVersion: 9 }
                : {}),
            };
      replace(changed);
      held.resolve();
      await blocking;
      expect(await undo).toBe(false);
      expect(write).not.toHaveBeenCalled();
      expect(fixture.state().byId[changed.id]).toBe(changed);
      expect(fixture.state().pendingRemoval).toBeNull();
    },
  );
});
