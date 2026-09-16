// `planCategoryRemoval` → `DatasetRepository.write` 의 계약 — memory·indexeddb 공용.
// TECH_PLAN §6 "planCategoryRemoval 이 계약 수준에서 고정하는 것" 의 문장을 그대로 단언한다.
// `dataset-repository.contract.ts` 가 이 러너를 부르므로 구현 쪽 진입점은 여전히 다섯 개다.
//
// 이 파일은 **테스트 파일이 아니다**. `describe`/`it`/`expect` 를 전역으로 쓰므로 테스트 러너 안에서만 import 한다.
import { planCategoryRemoval } from '@/domain/category/removal';
import type { DateKey } from '@/domain/date/date-key';
import { isDomainError } from '@/domain/errors';
import type { MetaDeps } from '@/domain/meta';
import { PALETTE } from '@/domain/theme/palette';

import type { Repositories } from '@/repositories/container';
import {
  contractCategory,
  contractDeps,
  contractSettings,
  contractTodo,
  idsOf,
  type ContractTarget,
} from '@/repositories/contract';

const T1 = '2026-01-16T09:30:00.000Z';

/** 부를 때마다 **다른** 시각을 주는 deps. `now()` 를 한 번만 부르는지가 결과로 드러난다. */
function tickingDeps(): MetaDeps {
  let tick = 0;
  return {
    now: () => `2026-01-16T09:30:0${tick++}.000Z`,
    id: contractDeps({ seed: 50 }).id,
  };
}

const D1 = '2026-01-15' as DateKey;
const D2 = '2026-01-16' as DateKey;

export function runCategoryRemovalContract(target: ContractTarget): void {
  describe(`DatasetRepository 계약 — 카테고리 삭제 (${target.name})`, () => {
    let repos: Repositories;

    beforeEach(async () => {
      repos = await target.create();
      await repos.settings.upsert(contractSettings(contractDeps()));
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

    it('§6 categories 에 삭제 대상이 없으면 CATEGORY_NOT_IN_LIST 로 거부한다 — 저장소는 그대로다', async () => {
      const deps = contractDeps();
      const category = contractCategory(deps);
      const todo = contractTodo(deps, { categoryId: category.id });
      await repos.categories.upsert(category);
      await repos.todos.upsert(todo);

      let thrown: unknown;
      try {
        planCategoryRemoval({
          category,
          todos: [todo],
          targetTodos: [],
          choice: { incomplete: 'delete' },
          deps: contractDeps({ now: T1 }),
          categories: [],
        });
      } catch (error: unknown) {
        thrown = error;
      }
      expect(isDomainError(thrown) ? thrown.code : thrown).toBe('CATEGORY_NOT_IN_LIST');

      expect(await repos.categories.getById(category.id)).toBeDefined();
      expect(await repos.todos.getById(todo.id)).toBeDefined();
    });

    it('§6 deps.now() 는 한 번만 불린다 — 카테고리 툼스톤과 삭제 투두의 deletedAt 이 같다 (category R14)', async () => {
      const deps = contractDeps();
      const category = contractCategory(deps);
      const first = contractTodo(deps, { categoryId: category.id, order: 0 });
      const second = contractTodo(deps, { categoryId: category.id, order: 1, date: D2 });
      await repos.categories.upsert(category);
      await repos.todos.upsert(first);
      await repos.todos.upsert(second);

      const { writes, result } = planCategoryRemoval({
        category,
        todos: await repos.todos.listByCategory(category.id),
        targetTodos: [],
        choice: { incomplete: 'delete' },
        deps: tickingDeps(),
        categories: await repos.categories.list(),
      });
      await repos.dataset.write(writes);

      const snapshot = await repos.dataset.readAll();
      const stamps = [
        snapshot.categories.find((c) => c.id === category.id)?.deletedAt,
        ...snapshot.todos
          .filter((t) => result.deletedTodoIds.includes(t.id))
          .map((t) => t.deletedAt),
      ];
      // tick 이 두 번 이상 돌았다면 값이 갈린다 — 첫 tick 하나로 셋이 전부 채워져야 한다.
      expect(stamps).toEqual([
        '2026-01-16T09:30:00.000Z',
        '2026-01-16T09:30:00.000Z',
        '2026-01-16T09:30:00.000Z',
      ]);
      expect(result.deletedAt).toBe('2026-01-16T09:30:00.000Z');
      expect(result.deletedTodoIds).toHaveLength(2);
    });

    it('§6 ① 이동 order 는 날짜별 base(d) = 대상 그룹 최대 + 1 부터 원래 정렬 순서로 잇는다 (category R14-a)', async () => {
      const deps = contractDeps();
      const target = contractCategory(deps, { name: '대상', order: 1 });
      const source = contractCategory(deps, { name: '원본', order: 0 });
      await repos.categories.upsert(target);
      await repos.categories.upsert(source);
      // 대상 그룹: D1 에 order 0·1, D2 에 order 5 → base(D1)=2, base(D2)=6
      for (const fields of [
        { date: D1, order: 0 },
        { date: D1, order: 1 },
        { date: D2, order: 5 },
      ]) {
        await repos.todos.upsert(contractTodo(deps, { categoryId: target.id, ...fields }));
      }
      // 옮길 것: D1 두 건(order 7 → 3 순서가 뒤집혀 있다)과 D2 한 건
      const lateD1 = contractTodo(deps, { categoryId: source.id, date: D1, order: 7 });
      const earlyD1 = contractTodo(deps, { categoryId: source.id, date: D1, order: 3 });
      const onlyD2 = contractTodo(deps, { categoryId: source.id, date: D2, order: 2 });
      for (const todo of [lateD1, earlyD1, onlyD2]) {
        await repos.todos.upsert(todo);
      }

      const { writes, result } = planCategoryRemoval({
        category: source,
        todos: await repos.todos.listByCategory(source.id),
        targetTodos: await repos.todos.listByCategory(target.id),
        choice: { incomplete: 'move', targetId: target.id },
        deps: contractDeps({ now: T1 }),
        categories: await repos.categories.list(),
      });
      await repos.dataset.write(writes);

      const moved = await repos.todos.listByCategory(target.id);
      const orderOf = async (id: string): Promise<number | undefined> =>
        (await repos.todos.getById(id))?.order;
      expect(await orderOf(earlyD1.id)).toBe(2);
      expect(await orderOf(lateD1.id)).toBe(3);
      expect(await orderOf(onlyD2.id)).toBe(6);
      expect(moved).toHaveLength(6);
      expect(await repos.categories.getById(source.id)).toBeUndefined();
      // 옮기는 순서는 원래 그룹의 표준 정렬(order asc)이다 — order 2·3·7.
      expect(result.moved.map((m) => m.prevOrder)).toEqual([2, 3, 7]);
    });

    it('§6 ② 즉석 생성 카테고리의 order 는 활성 최대 + 1 이고 미완료가 그리로 옮겨진다 (category R5)', async () => {
      const deps = contractDeps();
      const keep = contractCategory(deps, { name: '남는 것', order: 0 });
      const source = contractCategory(deps, { name: '원본', order: 3 });
      await repos.categories.upsert(keep);
      await repos.categories.upsert(source);
      const todo = contractTodo(deps, { categoryId: source.id, date: D1, order: 9 });
      await repos.todos.upsert(todo);

      const { writes, result } = planCategoryRemoval({
        category: source,
        todos: await repos.todos.listByCategory(source.id),
        targetTodos: [],
        choice: { incomplete: 'create', name: '새 그룹', color: PALETTE[1].light },
        deps: contractDeps({ now: T1, seed: 70 }),
        categories: await repos.categories.list(),
      });
      await repos.dataset.write(writes);

      expect(result.createdCategoryId).toBeDefined();
      const created = await repos.categories.getById(result.createdCategoryId ?? '');
      expect(created?.order).toBe(4);
      expect((await repos.todos.getById(todo.id))?.categoryId).toBe(created?.id);
      // 대상 그룹이 비어 있으므로 base(D1) = 0 이다.
      expect((await repos.todos.getById(todo.id))?.order).toBe(0);
    });
  });
}
