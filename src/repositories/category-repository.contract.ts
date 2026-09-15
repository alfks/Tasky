// `CategoryRepository` 계약 스위트 — memory·indexeddb 공용. ADR-0007 규칙 3 (a)~(e) 포함.
import type { Category } from '@/domain/category/category';
import { markDeleted, touch } from '@/domain/meta';

import type { CategoryRepository } from '@/repositories/category-repository';
import {
  contractCategory,
  contractDeps,
  idsOf,
  type ContractTarget,
} from '@/repositories/contract';

type ReadName = Exclude<keyof CategoryRepository, 'upsert'>;
type ReadCall = (
  repo: CategoryRepository,
  category: Category,
) => Promise<Category | Category[] | undefined>;

/**
 * (e) `READS` 전수 대조(ADR-0007 결정 6). `list` 는 **두 옵션 모두** 툼스톤을 내면 안 되므로
 * `includeClosed: true` 로 부른다 — 가장 넓은 조회에서도 빠지는지 보는 것이 이 케이스의 목적이다.
 */
const READS = {
  getById: (repo, category) => repo.getById(category.id),
  list: (repo) => repo.list({ includeClosed: true }),
} satisfies Record<ReadName, ReadCall>;

function rowsOf(result: Category | Category[] | undefined): Category[] {
  return result === undefined ? [] : Array.isArray(result) ? result : [result];
}

const T1 = '2026-01-16T09:30:00.000Z';
const T2 = '2026-01-17T09:30:00.000Z';

export function runCategoryRepositoryContract(target: ContractTarget): void {
  describe(`CategoryRepository 계약 (${target.name})`, () => {
    let repo: CategoryRepository;

    beforeEach(async () => {
      repo = (await target.create()).categories;
    });

    it('(a) Meta 를 왕복해도 값이 그대로다', async () => {
      const category = contractCategory(contractDeps(), { name: '공부', emoji: '📚' });

      await repo.upsert(category);

      expect(await repo.getById(category.id)).toEqual({ ...category });
    });

    it('(b) touch 한 값을 저장하면 rev 가 정확히 +1 된다', async () => {
      const category = contractCategory(contractDeps());
      await repo.upsert(category);

      await repo.upsert(touch({ ...category, name: '운동' }, T1));

      const saved = await repo.getById(category.id);
      expect(saved?.rev).toBe(category.rev + 1);
      expect(saved?.updatedAt).toBe(T1);
    });

    it('(c) 툼스톤은 READS 의 모든 조회 메서드에서 빠진다', async () => {
      const category = contractCategory(contractDeps());
      await repo.upsert(category);

      await repo.upsert(markDeleted(category, T1));

      for (const [name, read] of Object.entries(READS)) {
        const rows = rowsOf(await read(repo, category));
        expect(idsOf(rows), `${name} 가 툼스톤을 돌려줬다`).not.toContain(category.id);
      }
    });

    it('(d) 브랜드 없는 값은 저장할 수 없다', async () => {
      const category = contractCategory(contractDeps());
      await repo.upsert(category);
      const plain = await repo.getById(category.id);
      expect(plain).toBeDefined();
      if (plain === undefined) {
        return;
      }

      // @ts-expect-error 조회 결과는 브랜드가 없다 (ADR-0007 규칙 3-d, TS2345)
      await repo.upsert(plain);
    });

    it('(e) READS 는 인터페이스의 조회 메서드를 하나도 빠뜨리지 않는다', () => {
      for (const name of Object.keys(READS)) {
        expect(repo[name as ReadName]).toBeTypeOf('function');
      }
    });

    it('list 는 기본으로 활성만 order 오름차순으로 돌려준다', async () => {
      const deps = contractDeps();
      const second = contractCategory(deps, { order: 1 });
      const first = contractCategory(deps, { order: 0 });
      const closed = contractCategory(deps, { order: 2, status: 'completed', closedAt: T1 });
      for (const category of [second, first, closed]) {
        await repo.upsert(category);
      }

      expect(idsOf(await repo.list())).toEqual([first.id, second.id]);
    });

    it('includeClosed 는 활성 뒤에 종료된 것을 closedAt 내림차순으로 잇는다 (category R8)', async () => {
      const deps = contractDeps();
      const active = contractCategory(deps, { order: 0 });
      const closedEarly = contractCategory(deps, { order: 1, status: 'paused', closedAt: T1 });
      const closedLate = contractCategory(deps, { order: 2, status: 'completed', closedAt: T2 });
      for (const category of [closedEarly, active, closedLate]) {
        await repo.upsert(category);
      }

      expect(idsOf(await repo.list({ includeClosed: true }))).toEqual([
        active.id,
        closedLate.id,
        closedEarly.id,
      ]);
    });

    it('어느 옵션으로도 툼스톤은 나오지 않는다 (includeDeleted 는 없다)', async () => {
      const deps = contractDeps();
      const alive = contractCategory(deps, { order: 0 });
      const removed = contractCategory(deps, { order: 1 });
      await repo.upsert(alive);
      await repo.upsert(removed);

      await repo.upsert(markDeleted(removed, T1));

      expect(idsOf(await repo.list())).toEqual([alive.id]);
      expect(idsOf(await repo.list({ includeClosed: true }))).toEqual([alive.id]);
    });
  });
}
