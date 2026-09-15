// `DatasetRepository` 계약 스위트 — memory·indexeddb 공용 (ADR-0009, TECH_PLAN §6 ①~⑤).
// ① write 원자성(중간 실패 주입 → 변화 0) ② restore 왕복 ③ readAll 이 툼스톤을 **포함** ④ 병합 손실 0
// ⑤ `restore(readAll 결과)` 컴파일 실패.
//
// `DatasetRepository` 는 엔티티 레포지토리가 아니므로 `READS` 전수 대조의 대상이 아니다(ADR-0007 규칙 2).
import { planCategoryRemoval } from '@/domain/category/removal';
import type { DatasetWrite } from '@/domain/dataset';
import { markDeleted } from '@/domain/meta';

import type { Repositories } from '@/repositories/container';
import {
  contractCategory,
  contractDeps,
  contractFocusSession,
  contractSettings,
  contractTodo,
  idsOf,
  type ContractTarget,
} from '@/repositories/contract';
import { isRepositoryError } from '@/repositories/repository-error';

const T1 = '2026-01-16T09:30:00.000Z';
const OLD = '2025-12-01T00:00:00.000Z';

/** 계약에 없는 테이블을 가리키는 쓰기 — `write` 중간에 실패를 주입하는 값이다. */
function brokenWrite(): DatasetWrite {
  return {
    table: '없는테이블',
    entity: contractTodo(contractDeps({ seed: 99 })),
  } as unknown as DatasetWrite;
}

export function runDatasetRepositoryContract(target: ContractTarget): void {
  describe(`DatasetRepository 계약 (${target.name})`, () => {
    let repos: Repositories;

    beforeEach(async () => {
      repos = await target.create();
      await repos.settings.upsert(contractSettings(contractDeps()));
    });

    it('③ readAll 은 툼스톤을 포함한다 — 엔티티 조회는 같은 로우를 감춘다', async () => {
      const deps = contractDeps();
      const category = contractCategory(deps);
      await repos.categories.upsert(category);
      await repos.categories.upsert(markDeleted(category, T1));

      const snapshot = await repos.dataset.readAll();

      expect(idsOf(snapshot.categories)).toEqual([category.id]);
      expect(snapshot.categories[0].deletedAt).toBe(T1);
      expect(await repos.categories.getById(category.id)).toBeUndefined();
      expect(await repos.categories.list({ includeClosed: true })).toEqual([]);
    });

    it('설정 행이 없으면 readAll 은 RepositoryError 다 — 레포지토리가 만들지 않는다', async () => {
      const empty = await target.create();

      await expect(empty.dataset.readAll()).rejects.toSatisfy(isRepositoryError);
    });

    it('write 는 여러 테이블을 한 번에 쓴다', async () => {
      const deps = contractDeps();
      const todo = contractTodo(deps);
      const category = contractCategory(deps);
      const session = contractFocusSession(deps);

      await repos.dataset.write([
        { table: 'todos', entity: todo },
        { table: 'categories', entity: category },
        { table: 'focusSessions', entity: session },
      ]);

      expect(await repos.todos.getById(todo.id)).toBeDefined();
      expect(await repos.categories.getById(category.id)).toBeDefined();
      expect(await repos.focusSessions.getById(session.id)).toBeDefined();
    });

    it('① write 가 중간에 실패하면 아무것도 쓰지 않는다', async () => {
      const deps = contractDeps();
      const before = contractTodo(deps);
      const after = contractCategory(deps);

      await expect(
        repos.dataset.write([
          { table: 'todos', entity: before },
          brokenWrite(),
          { table: 'categories', entity: after },
        ]),
      ).rejects.toThrow();

      const snapshot = await repos.dataset.readAll();
      expect(snapshot.todos).toEqual([]);
      expect(snapshot.categories).toEqual([]);
    });

    it('② restore 는 스냅샷으로 왕복한다 — 기존 로우는 사라지고 스냅샷만 남는다', async () => {
      const deps = contractDeps();
      const stale = contractTodo(deps, { title: '지워질 것' });
      await repos.todos.upsert(stale);

      const kept = contractTodo(deps, { title: '남을 것' });
      const category = contractCategory(deps);
      const settings = contractSettings(contractDeps({ now: T1 }));
      await repos.dataset.restore({
        todos: [kept],
        categories: [category],
        focusSessions: [],
        settings,
      });

      const snapshot = await repos.dataset.readAll();
      expect(idsOf(snapshot.todos)).toEqual([kept.id]);
      expect(idsOf(snapshot.categories)).toEqual([category.id]);
      expect(snapshot.settings).toEqual({ ...settings });
      expect(await repos.todos.getById(stale.id)).toBeUndefined();
    });

    it('④ 병합에서 로컬 툼스톤이 파일의 더 오래된 비삭제 로우로 부활하지 않는다 (ADR-0009 규칙 3)', async () => {
      const deps = contractDeps();
      const local = contractCategory(deps, { name: '로컬 이름' });
      const tombstone = markDeleted(local, T1);
      await repos.categories.upsert(tombstone);
      // 파일에서 온 같은 id 의 더 오래된 비삭제 로우. 병합 결과는 "툼스톤을 실은 최종 전량" 이어야 한다.
      const fromFile = contractCategory(contractDeps({ now: OLD }), {
        id: local.id,
        name: '파일의 옛 이름',
      });
      expect(fromFile.updatedAt < tombstone.updatedAt).toBe(true);

      await repos.dataset.restore({
        todos: [],
        categories: [tombstone],
        focusSessions: [],
        settings: contractSettings(contractDeps()),
      });

      const snapshot = await repos.dataset.readAll();
      expect(snapshot.categories).toHaveLength(1);
      expect(snapshot.categories[0].deletedAt).toBe(T1);
      expect(snapshot.categories[0].name).toBe('로컬 이름');
      expect(await repos.categories.getById(local.id)).toBeUndefined();
    });

    it('⑤ readAll 결과를 그대로 restore 에 넘기면 컴파일 에러다 (ADR-0009 규칙 2)', async () => {
      const snapshot = await repos.dataset.readAll();

      // @ts-expect-error readAll 은 브랜드 없는 DatasetSnapshot 이다 — restore 는 PersistableSnapshot 만 받는다
      await repos.dataset.restore(snapshot);
    });

    it('planCategoryRemoval 의 writes 를 write 한 번으로 적용한다 (category R13)', async () => {
      const deps = contractDeps();
      const category = contractCategory(deps);
      const open = contractTodo(deps, { categoryId: category.id, order: 0 });
      const done = contractTodo(deps, { categoryId: category.id, order: 1, done: true });
      await repos.categories.upsert(category);
      await repos.todos.upsert(open);
      await repos.todos.upsert(done);

      const { writes, result } = planCategoryRemoval({
        category,
        todos: await repos.todos.listByCategory(category.id),
        targetTodos: [],
        choice: { incomplete: 'delete' },
        deps: contractDeps({ now: T1 }),
        categories: await repos.categories.list(),
      });
      await repos.dataset.write(writes);

      expect(result.deletedTodoIds).toEqual([open.id]);
      expect(await repos.categories.getById(category.id)).toBeUndefined();
      expect(idsOf(await repos.todos.listAll())).toEqual([done.id]);
      // 완료 투두는 한 글자도 건드리지 않는다 (category R14).
      expect((await repos.todos.getById(done.id))?.rev).toBe(done.rev);
    });
  });
}
