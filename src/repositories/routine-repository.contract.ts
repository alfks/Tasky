// `RoutineRepository` 계약 스위트 — memory·indexeddb 공용. ADR-0007 규칙 3 (a)~(d) 포함.
//
// D-day(`dday-repository.contract.ts`)와 같은 이유로 `memory.contract.test.ts`/
// `indexeddb.contract.test.ts`에 한 줄로 끼지 않는다 — 그 두 파일은 이 티켓(T-81) owns 밖이다.
// `routine-repository.contract.test.ts`가 이 스위트를 memory·indexeddb 양쪽에 돌린다.
import { createMeta, markDeleted, touch, type MetaDeps, type Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';

import {
  contractDeps,
  idsOf,
  CONTRACT_CATEGORY_ID,
  CONTRACT_DATE,
  CONTRACT_INSTANT,
  type ContractTarget,
} from '@/repositories/contract';
import type { RoutineRepository } from '@/repositories/routine-repository';

/** 루틴 한 건. 계약 전용 — `routine.rules.ts#createRoutine` 의 검증을 거치지 않고 바로 만든다. */
function contractRoutine(
  deps: MetaDeps,
  fields: Partial<Routine> & { id?: string } = {},
): Persistable<Routine> {
  return createMeta<Routine>(deps, {
    title: '운동',
    categoryId: CONTRACT_CATEGORY_ID,
    recurrence: { type: 'weekly', daysOfWeek: [4] },
    startDate: CONTRACT_DATE,
    active: true,
    materializedThrough: CONTRACT_DATE,
    ...fields,
  });
}

const T1 = '2026-01-16T09:30:00.000Z';

export function runRoutineRepositoryContract(target: ContractTarget): void {
  describe(`RoutineRepository 계약 (${target.name})`, () => {
    let repo: RoutineRepository;

    beforeEach(async () => {
      repo = (await target.create()).routines;
    });

    it('(a) Meta 를 왕복해도 값이 그대로다', async () => {
      const routine = contractRoutine(contractDeps());

      await repo.upsert(routine);

      expect(await repo.getById(routine.id)).toEqual({ ...routine });
    });

    it('(b) touch 한 값을 저장하면 rev 가 정확히 +1 된다', async () => {
      const routine = contractRoutine(contractDeps());
      await repo.upsert(routine);

      await repo.upsert(touch({ ...routine, title: '요가' }, T1));

      const saved = await repo.getById(routine.id);
      expect(saved?.rev).toBe(routine.rev + 1);
      expect(saved?.title).toBe('요가');
      expect(saved?.updatedAt).toBe(T1);
    });

    it('(c) 툼스톤은 getById·list() 어느 옵션에서도 나오지 않는다', async () => {
      const routine = contractRoutine(contractDeps());
      await repo.upsert(routine);

      await repo.upsert(markDeleted(routine, T1));

      expect(await repo.getById(routine.id)).toBeUndefined();
      expect(idsOf(await repo.list())).not.toContain(routine.id);
      expect(idsOf(await repo.list({ includeInactive: true }))).not.toContain(routine.id);
    });

    it('(d) 브랜드 없는 값은 저장할 수 없다', async () => {
      const routine = contractRoutine(contractDeps());
      await repo.upsert(routine);
      const plain = await repo.getById(routine.id);
      expect(plain).toBeDefined();
      if (plain === undefined) {
        return;
      }

      // @ts-expect-error 조회 결과는 브랜드가 없다 (ADR-0007 규칙 3-d, TS2345)
      await repo.upsert(plain);
    });

    it('list() 기본은 active 만, includeInactive 면 중지된 것까지 보인다', async () => {
      const deps = contractDeps();
      const active = contractRoutine(deps, { id: '50000000-0000-4000-8000-000000000001' });
      const paused = contractRoutine(deps, {
        id: '50000000-0000-4000-8000-000000000002',
        active: false,
      });
      await repo.upsert(active);
      await repo.upsert(paused);

      expect(idsOf(await repo.list())).toEqual([active.id]);
      expect(idsOf(await repo.list({ includeInactive: true })).sort()).toEqual(
        [active.id, paused.id].sort(),
      );
    });

    it('list() 정렬은 createdAt asc → id asc(동률 타이브레이크)', async () => {
      const deps = contractDeps({ now: CONTRACT_INSTANT });
      const first = contractRoutine(deps, { id: '50000000-0000-4000-8000-000000000002' });
      const second = contractRoutine(deps, { id: '50000000-0000-4000-8000-000000000001' });
      await repo.upsert(first);
      await repo.upsert(second);

      // 같은 시각이면 id 오름차순이라, id 값이 더 작은 second 가 먼저다.
      expect(idsOf(await repo.list())).toEqual([second.id, first.id]);
    });
  });
}
