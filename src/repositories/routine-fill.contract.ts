// `(routineId, date)` 워터마크 멱등성(ADR-0017, routine.md R6·R7·R10) — `RoutineRepository`·
// `TodoRepository`·`DatasetRepository` 를 **실제 구현**(memory·indexeddb) 위에서 함께 돌린다.
//
// D-day 의 계약 스위트(`dday-repository.contract.ts`)와 같은 이유로 `memory.contract.test.ts`/
// `indexeddb.contract.test.ts` 에 끼지 않고 별도 파일(`routine-fill.contract.test.ts`)이 부른다.
// `routine-repository.contract.ts`(CRUD 계약)와 파일을 가르는 이유는 300줄 제한(code-style §5)이다.
//
// 여기서 재현하는 절차(`materialize`)는 T-82 의 스토어 액션 `materializeRoutines` 가 훗날 할 일과
// 같다 — 단, 그 배선(date-strip 방문 시점 호출)은 T-82 owns 다. 이 파일은 **저장소 계층**에서 워터마크
// 멱등성 자체만 고정한다. `materialize` 는 매번 **저장소에서 다시 읽은** 루틴을 쓴다(실제 배선도 그렇다
// — 스토어에 캐시된 낡은 값으로 계획을 세우면 워터마크가 뒤로 물러날 수 있다).
import type { DatasetWrite } from '@/domain/dataset';
import type { DateKey } from '@/domain/date/date-key';
import type { RoutineId } from '@/domain/ids';
import { createMeta, markDeleted, touch, type Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { planRoutineFill } from '@/domain/routine/routine-fill';
import { pauseRoutine, resumeRoutine } from '@/domain/routine/routine.rules';

import type { Repositories } from '@/repositories/container';
import {
  contractCategory,
  contractDeps,
  CONTRACT_CATEGORY_ID,
  type ContractTarget,
} from '@/repositories/contract';

const START = '2026-01-15' as DateKey; // 목요일

function freshRoutine(deps = contractDeps()): Persistable<Routine> {
  return createMeta<Routine>(deps, {
    id: '60000000-0000-4000-8000-000000000001',
    title: '운동',
    categoryId: CONTRACT_CATEGORY_ID,
    recurrence: { type: 'weekly', daysOfWeek: [4] },
    startDate: START,
    active: true,
    materializedThrough: '2026-01-14' as DateKey,
  });
}

let materializeCallSeq = 0;

/** T-82 `materializeRoutines` 가 할 일을 저장소 계층에서 재현한다: 계획 → 한 트랜잭션 커밋. */
async function materialize(
  repos: Repositories,
  routineId: RoutineId,
  through: DateKey,
): Promise<Routine | undefined> {
  const current = await repos.routines.getById(routineId);
  if (current === undefined) {
    return undefined;
  }
  const existing = await repos.todos.listByDateRange(current.materializedThrough, through);
  materializeCallSeq += 1;
  const plan = planRoutineFill(
    { routine: current, through, existing },
    contractDeps({ seed: materializeCallSeq * 1000 }),
  );
  if (plan === null) {
    return current;
  }
  const writes: DatasetWrite[] = [
    ...plan.todos.map((entity) => ({ table: 'todos' as const, entity })),
    { table: 'routines' as const, entity: plan.routine },
  ];
  await repos.dataset.write(writes);
  return plan.routine;
}

export function runRoutineFillContract(target: ContractTarget): void {
  describe(`루틴 지연 생성 워터마크 멱등성 (${target.name})`, () => {
    let repos: Repositories;
    let routine: Persistable<Routine>;

    beforeEach(async () => {
      repos = await target.create();
      await repos.categories.upsert(contractCategory(contractDeps()));
      routine = freshRoutine();
      await repos.routines.upsert(routine);
    });

    it('같은 구간을 두 번 채워도 인스턴스가 두 번 생기지 않는다(멱등)', async () => {
      const through = '2026-01-29' as DateKey; // 1/15·1/22·1/29 세 번
      const first = await materialize(repos, routine.id, through);
      const second = await materialize(repos, routine.id, through); // 워터마크가 이미 through

      const todos = await repos.todos.listByDateRange(START, through);
      expect(todos).toHaveLength(3);
      expect(second?.materializedThrough).toBe(first?.materializedThrough);
    });

    it('삭제한 인스턴스는 그 뒤 구간을 채워도 부활하지 않는다', async () => {
      await materialize(repos, routine.id, '2026-01-15' as DateKey);
      const [created] = await repos.todos.listByDateRange(START, '2026-01-15' as DateKey);
      expect(created).toBeDefined();
      await repos.todos.upsert(markDeleted(created!, '2026-01-16T00:00:00.000Z'));

      await materialize(repos, routine.id, '2026-01-22' as DateKey);

      const todos = await repos.todos.listByDateRange(START, '2026-01-22' as DateKey);
      expect(todos.map((t) => t.date)).toEqual(['2026-01-22']); // 1/15 는 되살아나지 않는다
    });

    it('이동한 인스턴스는 원래 날짜 슬롯에 다시 생기지 않는다', async () => {
      await materialize(repos, routine.id, '2026-01-15' as DateKey);
      const [created] = await repos.todos.listByDateRange(START, '2026-01-15' as DateKey);
      expect(created).toBeDefined();
      await repos.todos.upsert(
        touch({ ...created!, date: '2026-01-20' as DateKey }, '2026-01-16T00:00:00.000Z'),
      );

      await materialize(repos, routine.id, '2026-01-22' as DateKey);

      const todos = await repos.todos.listByDateRange(START, '2026-01-22' as DateKey);
      expect(todos.filter((t) => t.date === START)).toEqual([]); // 원래 슬롯엔 다시 안 생긴다
      expect(todos.some((t) => t.date === '2026-01-22')).toBe(true);
    });

    it('불량 원소가 섞이면 투두도 워터마크도 전혀 반영되지 않는다(원자성, DatasetRepository.write)', async () => {
      const through = '2026-01-15' as DateKey;
      const plan = planRoutineFill({ routine, through, existing: [] }, contractDeps({ seed: 200 }));
      expect(plan).not.toBeNull();

      // 불량 원소(entity.id 없음) — DatasetWrite 로 캐스팅해 타입은 맞지만 런타임엔 거절되는 값을 만든다.
      const badWrite = { table: 'todos', entity: { id: '' } } as unknown as DatasetWrite;
      const writes: DatasetWrite[] = [
        ...plan!.todos.map((entity) => ({ table: 'todos' as const, entity })),
        { table: 'routines' as const, entity: plan!.routine },
        badWrite,
      ];

      await expect(repos.dataset.write(writes)).rejects.toThrow();

      expect(await repos.todos.listByDateRange(START, through)).toEqual([]);
      const stored = await repos.routines.getById(routine.id);
      expect(stored?.materializedThrough).toBe(routine.materializedThrough); // 워터마크 불변
    });

    it('중지 중에는 채우지 않고, 재개하면 소급 없이 재개 시점부터 이어간다(R7)', async () => {
      await repos.routines.upsert(pauseRoutine(routine, contractDeps()));

      const stillPaused = await materialize(repos, routine.id, '2026-01-22' as DateKey);
      expect(stillPaused?.materializedThrough).toBe(routine.materializedThrough); // 중지 중엔 안 움직인다
      expect(await repos.todos.listByDateRange(START, '2026-01-22' as DateKey)).toEqual([]);

      // 3/1 에 재개 — 1/14~2/28 구간은 영영 채우지 않는다(소급 없음).
      const today = '2026-03-01' as DateKey;
      const paused = (await repos.routines.getById(routine.id))!;
      await repos.routines.upsert(resumeRoutine(paused, today, contractDeps()));

      const afterResume = await materialize(repos, routine.id, '2026-03-05' as DateKey);
      const todos = await repos.todos.listByDateRange(START, '2026-03-05' as DateKey);
      // 1/15~2/28 구간(멈춰 있던 동안)은 영영 안 채운다 — 재개 뒤 첫 목요일(3/5)만 생긴다.
      expect(todos.map((t) => t.date)).toEqual(['2026-03-05']);
      expect(afterResume?.materializedThrough).toBe('2026-03-05');
    });
  });
}
