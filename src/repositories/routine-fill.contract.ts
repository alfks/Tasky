// 슬롯 id 채우기(ADR-0018, routine.md R6·R7·R10) — `RoutineRepository`·`TodoRepository`·
// `DatasetRepository` 를 **실제 구현**(memory·indexeddb) 위에서 함께 돌린다.
//
// D-day 의 계약 스위트(`dday-repository.contract.ts`)와 같은 이유로 `memory.contract.test.ts`/
// `indexeddb.contract.test.ts` 에 끼지 않고 별도 파일(`routine-fill.contract.test.ts`)이 부른다.
// `routine-repository.contract.ts`(CRUD 계약)와 파일을 가르는 이유는 300줄 제한(code-style §5)이다.
//
// 여기서 재현하는 절차(`materialize`)는 스토어 액션 `materializeRoutines`(`todo-routine-fill.ts`)가
// 하는 일과 같다. **채우기는 루틴 로우를 쓰지 않는다(ADR-0018 §결정 3, 최종 설계로 복귀 — T-92b 가
// PR #121 의 임시 복원을 되돌렸다)** — `planRoutineFill`(`RoutineFillPlan`)은 이제 `todos` 만 돌려주고
// `fillFloor` 는 `routine.rules.ts` 의 `createRoutine`·`resumeRoutine` 만 옮긴다. 배경 채우기의
// 중복·부활 방지는 `existingIdsFor`(아래, `DatasetRepository.readAll()` 로 툼스톤까지 본 테스트 전용
// 근사 — 프로덕션은 `SyncRepository.existingIds`)가 맡는다.
import type { DatasetWrite } from '@/domain/dataset';
import type { DateKey } from '@/domain/date/date-key';
import type { RoutineId } from '@/domain/ids';
import { createMeta, markDeleted, touch, type MetaDeps, type Persistable } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { planRoutineFill } from '@/domain/routine/routine-fill';
import { pauseRoutine, resumeRoutine } from '@/domain/routine/routine.rules';
import { routineInstanceSlotId } from '@/domain/routine/slot-id';
import type { Todo } from '@/domain/todo/todo';
import { normalizeTodoTitle } from '@/domain/todo/todo.rules';

import type { Repositories } from '@/repositories/container';
import {
  contractCategory,
  contractDeps,
  contractSettings,
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
    fillFloor: '2026-01-14' as DateKey,
  });
}

/**
 * 1단계 검증(`entity` 가 객체이고 `id` 가 있는지)은 통과하지만 구조적 복제가 불가능한 로우 —
 * Dexie 가 실제 트랜잭션 **안에서** 던지게 만든다(`dataset-atomicity.test.ts` 와 같은 기법). id 가
 * 없는 값과 달리 이건 stage-1 을 통과하므로, 이 값이 섞이면 **이미 적용을 시작한 뒤의 실패**를
 * 재현한다 — 진짜 롤백이 시험되는 지점이다.
 */
function uncloneableTodo(deps: MetaDeps): Persistable<Todo> {
  return createMeta<Todo>(deps, {
    categoryId: CONTRACT_CATEGORY_ID,
    date: START,
    title: (() => 'boom') as unknown as string,
    done: false,
    order: 0,
  });
}

let materializeCallSeq = 0;

/**
 * `existing`(툼스톤 포함 전량)에서 `planRoutineFill` 이 쓸 `existingIds` 를 만든다 — 각 로우의 실제
 * id(idempotency) + 같은 카테고리·정규화된 제목이 이미 있으면 그 날짜의 슬롯 id(R4 dedup, 실제 id 가
 * 슬롯 id 가 아니어도 상관없다 — `planRoutineFill` 은 멤버십만 본다).
 *
 * **프로덕션(`todo-routine-fill.ts`)과 다른 점**: 여기서는 `DatasetRepository.readAll()`(툼스톤
 * 포함, ADR-0009)로 이미 지운/옮긴 슬롯까지 인식한다 — 실제 앱은 `SyncRepository.existingIds`(T-92
 * 후속, 이 티켓 owns 밖)가 같은 보장을 bulkGet 하나로 준다. `readAll()` 을 여기서 쓰는 것은 그 넷째
 * 프로덕션 호출처가 아니라 **테스트 전용 근사**다(ADR-0009 규칙 4는 프로덕션 호출처 수를 센다).
 */
function existingIdsFor(routine: Routine, existing: readonly Todo[]): Set<string> {
  const title = normalizeTodoTitle(routine.title);
  const ids = new Set<string>();
  for (const todo of existing) {
    ids.add(todo.id);
    if (todo.categoryId === routine.categoryId && normalizeTodoTitle(todo.title) === title) {
      ids.add(routineInstanceSlotId(routine.id, todo.date));
    }
  }
  return ids;
}

/** `materializeRoutines` 가 저장소 계층에서 하는 일을 재현한다: 계획 → 트랜잭션 커밋. **루틴 로우는
 * 쓰지 않는다**(ADR-0018 §결정 3) — `plan.todos` 만 쓴다. 0건이면(R4) 아무것도 쓰지 않는다(빈
 * 트랜잭션을 만들 이유가 없다). */
async function materialize(
  repos: Repositories,
  routineId: RoutineId,
  through: DateKey,
): Promise<void> {
  const current = await repos.routines.getById(routineId);
  if (current === undefined) {
    return;
  }
  const snapshot = await repos.dataset.readAll();
  materializeCallSeq += 1;
  const plan = planRoutineFill(
    { routine: current, through, existingIds: existingIdsFor(current, snapshot.todos) },
    contractDeps({ seed: materializeCallSeq * 1000 }),
  );
  if (plan === null || plan.todos.length === 0) {
    return;
  }
  const writes: DatasetWrite[] = plan.todos.map((entity) => ({ table: 'todos' as const, entity }));
  await repos.dataset.write(writes);
}

export function runRoutineFillContract(target: ContractTarget): void {
  describe(`루틴 슬롯 id 채우기 (${target.name})`, () => {
    let repos: Repositories;
    let routine: Persistable<Routine>;

    beforeEach(async () => {
      repos = await target.create();
      await repos.categories.upsert(contractCategory(contractDeps()));
      // `materialize()` 가 `dataset.readAll()` 로 existingIds 를 만드므로(툼스톤 포함, 아래 주석)
      // settings 행이 있어야 한다(readAll 계약, ADR-0009).
      await repos.settings.upsert(contractSettings(contractDeps()));
      routine = freshRoutine();
      await repos.routines.upsert(routine);
    });

    it('같은 구간을 두 번 채워도 인스턴스가 두 번 생기지 않는다(멱등, 슬롯 id 판정)', async () => {
      const through = '2026-01-29' as DateKey; // 1/15·1/22·1/29 세 번
      await materialize(repos, routine.id, through);
      await materialize(repos, routine.id, through);

      const todos = await repos.todos.listByDateRange(START, through);
      expect(todos).toHaveLength(3);
    });

    it('채운 뒤에도 루틴 로우의 fillFloor·rev 는 바뀌지 않는다(ADR-0018 §결정 3, 되돌리기 정정)', async () => {
      const before = await repos.routines.getById(routine.id);
      const through = '2026-01-29' as DateKey;
      await materialize(repos, routine.id, through);
      const after = await repos.routines.getById(routine.id);
      expect(after?.fillFloor).toBe(before?.fillFloor); // 얼려 둔다 — through 로 전진하지 않는다
      expect(after?.rev).toBe(before?.rev); // 로우 자체를 쓰지 않았다는 증거(아웃박스에도 안 실린다)
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

    // entity 축이 명백히 불량(예: id 없음)한 경우의 "아무것도 안 쓴다"는 이미 이 코드 경로가 공유하는
    // `dataset-repository.contract.ts`(양쪽 구현 공용)가 고정한다 — 그 축은 여기서 다시 만들지 않는다.
    // 아래는 그것과 다른 것을 본다: **이미 적용을 시작한 뒤**의 실패에서도 롤백이 되는가. memory 의
    // `put()`(memory/live.ts)은 얕은 스프레드라 구조적 복제가 불가능한 값(함수 등)도 그대로 받아들여
    // 이 기법으로는 던지지 않는다(`dataset-atomicity.test.ts` 가 IndexedDB 전용 파일인 것과 같은 이유)
    // — 그래서 이 시험은 IndexedDB 에서만 뜻이 있다.
    if (target.name === 'indexeddb') {
      it('구조적 복제 불가 로우가 섞이면 이미 적용된 것까지 전부 롤백된다(원자성, indexeddb)', async () => {
        const through = '2026-01-15' as DateKey;
        const plan = planRoutineFill(
          { routine, through, existingIds: new Set() },
          contractDeps({ seed: 200 }),
        );
        expect(plan).not.toBeNull();

        const writes: DatasetWrite[] = [
          ...plan!.todos.map((entity) => ({ table: 'todos' as const, entity })),
          { table: 'todos' as const, entity: uncloneableTodo(contractDeps({ seed: 300 })) },
        ];

        await expect(repos.dataset.write(writes)).rejects.toThrow();

        expect(await repos.todos.listByDateRange(START, through)).toEqual([]);
      });
    }

    it('중지 중에는 채우지 않고, 재개하면 소급 없이 재개 시점부터 이어간다(R7)', async () => {
      await repos.routines.upsert(pauseRoutine(routine, contractDeps()));

      await materialize(repos, routine.id, '2026-01-22' as DateKey);
      expect(await repos.todos.listByDateRange(START, '2026-01-22' as DateKey)).toEqual([]);

      // 3/1 에 재개 — 1/14~2/28 구간은 영영 채우지 않는다(소급 없음).
      const today = '2026-03-01' as DateKey;
      const paused = (await repos.routines.getById(routine.id))!;
      await repos.routines.upsert(resumeRoutine(paused, today, contractDeps()));

      await materialize(repos, routine.id, '2026-03-05' as DateKey);
      const todos = await repos.todos.listByDateRange(START, '2026-03-05' as DateKey);
      // 1/15~2/28 구간(멈춰 있던 동안)은 영영 안 채운다 — 재개 뒤 첫 목요일(3/5)만 생긴다.
      expect(todos.map((t) => t.date)).toEqual(['2026-03-05']);
    });
  });
}
