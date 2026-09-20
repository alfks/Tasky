// `DdayRepository` 계약 스위트 — memory·indexeddb 공용. ADR-0007 규칙 3 (a)~(d) 포함.
//
// `list()` 순서는 계약에 넣지 않는다 — calendar.md §4 가 "정렬은 메모리(도메인)에서" 라고 이미
// 정했으므로 저장소 두 구현이 순서까지 같을 필요가 없다(집합만 같으면 된다).
import type { Dday } from '@/domain/dday/dday';
import { createMeta, markDeleted, touch, type MetaDeps, type Persistable } from '@/domain/meta';

import {
  contractDeps,
  idsOf,
  CONTRACT_INSTANT,
  type ContractTarget,
} from '@/repositories/contract';
import type { DdayRepository } from '@/repositories/dday-repository';

/** D-day 한 건. 계약 전용 — `dday.rules.ts#createDday` 의 검증을 거치지 않고 바로 만든다. */
function contractDday(
  deps: MetaDeps,
  fields: Partial<Dday> & { id?: string } = {},
): Persistable<Dday> {
  return createMeta<Dday>(deps, { title: 'D-day', date: '2026-02-01', ...fields });
}

const T1 = '2026-01-16T09:30:00.000Z';

export function runDdayRepositoryContract(target: ContractTarget): void {
  describe(`DdayRepository 계약 (${target.name})`, () => {
    let repo: DdayRepository;

    beforeEach(async () => {
      repo = (await target.create()).dday;
    });

    it('(a) Meta 를 왕복해도 값이 그대로다', async () => {
      const dday = contractDday(contractDeps());

      await repo.upsert(dday);

      expect(await repo.list()).toEqual([{ ...dday }]);
    });

    it('(b) touch 한 값을 저장하면 rev 가 정확히 +1 된다', async () => {
      const dday = contractDday(contractDeps());
      await repo.upsert(dday);

      await repo.upsert(touch({ ...dday, title: '생일' }, T1));

      const [saved] = await repo.list();
      expect(saved?.rev).toBe(dday.rev + 1);
      expect(saved?.title).toBe('생일');
      expect(saved?.updatedAt).toBe(T1);
    });

    it('(c) 툼스톤은 list() 에서 빠진다', async () => {
      const dday = contractDday(contractDeps());
      await repo.upsert(dday);

      await repo.upsert(markDeleted(dday, T1));

      expect(idsOf(await repo.list())).not.toContain(dday.id);
    });

    it('(d) 브랜드 없는 값은 저장할 수 없다', async () => {
      const dday = contractDday(contractDeps());
      await repo.upsert(dday);
      const [plain] = await repo.list();
      expect(plain).toBeDefined();
      if (plain === undefined) {
        return;
      }

      // @ts-expect-error 조회 결과는 브랜드가 없다 (ADR-0007 규칙 3-d, TS2345)
      await repo.upsert(plain);
    });

    it('list() 는 전량을 돌려준다(순서는 호출부가 정한다)', async () => {
      const deps = contractDeps();
      const first = contractDday(deps, { id: '40000000-0000-4000-8000-000000000001' });
      const second = contractDday(deps, {
        id: '40000000-0000-4000-8000-000000000002',
        date: '2026-03-01',
      });
      await repo.upsert(first);
      await repo.upsert(second);

      expect(idsOf(await repo.list()).sort()).toEqual([first.id, second.id].sort());
    });

    it('삭제 되돌리기: 되살린 값을 upsert 하면 다시 list() 에 보인다', async () => {
      const dday = contractDday(contractDeps());
      await repo.upsert(dday);
      const deleted = markDeleted(dday, T1);
      await repo.upsert(deleted);
      expect(idsOf(await repo.list())).toEqual([]);

      const restored = touch(touch(dday, T1), CONTRACT_INSTANT);
      await repo.upsert(restored);

      const [saved] = await repo.list();
      expect(saved?.id).toBe(dday.id);
      expect(saved?.deletedAt).toBeUndefined();
    });
  });
}
