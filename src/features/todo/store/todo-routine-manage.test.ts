// 루틴 관리 액션 테스트(routine.md R7·R10·R13). 저장소는 memory 구현이고 매 테스트 새로 주입한다.
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addCivilDays } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import { adopt, touch } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { createRoutine } from '@/domain/routine/routine.rules';

import { getRepositories, setRepositories, type Repositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { createTodoStore, type TodoStore } from '@/features/todo/store/todo-store';
import { fixedDeps, FIXTURE_DATE } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID, makeTodo } from '@/test/fixtures/todo';

type Store = ReturnType<typeof createTodoStore>;

let store: Store;
let repos: Repositories;

beforeEach(() => {
  repos = createMemoryRepositories();
  setRepositories(repos);
  store = createTodoStore(fixedDeps());
});

const state = (): TodoStore => store.getState();

let seedSeq = 0;

/** 저장소에 직접 심는 무기한 루틴 — 관리 액션이 그 위에서 도는지만 본다(등록 자체는 T-82 몫). */
async function seedRoutine(
  overrides: { title?: string; endDate?: DateKey } = {},
): Promise<Routine> {
  seedSeq += 1;
  const routine = createRoutine(
    {
      title: '운동',
      categoryId: FIXTURE_CATEGORY_ID,
      recurrence: { type: 'weekly', daysOfWeek: [4] },
      startDate: FIXTURE_DATE,
      ...overrides,
    },
    fixedDeps({ idSeed: seedSeq }),
  );
  await getRepositories().routines.upsert(routine);
  return routine;
}

describe('loadRoutines', () => {
  it('저장소의 루틴 전부(중지 포함)를 메모리로 읽는다', async () => {
    const active = await seedRoutine();
    const paused = await seedRoutine({ title: '독서' });
    await getRepositories().routines.upsert(touch({ ...paused, active: false }, fixedDeps().now()));

    await state().loadRoutines();

    expect(Object.keys(state().routines).sort()).toEqual([active.id, paused.id].sort());
    expect(state().routineStatus).toBe('ready');
  });
});

describe('pauseRoutine · resumeRoutine (R7)', () => {
  it('중지하면 저장소·메모리 둘 다 active:false 가 되고 writeRevision 이 오른다', async () => {
    const routine = await seedRoutine();
    const before = state().writeRevision;

    const ok = await state().pauseRoutine(routine.id);

    expect(ok).toBe(true);
    expect(state().writeRevision).toBe(before + 1);
    const saved = await getRepositories().routines.getById(routine.id);
    expect(saved?.active).toBe(false);
  });

  it('없는 id 를 중지하려 하면 false 이고 아무것도 바뀌지 않는다', async () => {
    const ok = await state().pauseRoutine('없는-id');
    expect(ok).toBe(false);
    expect(state().error).toBeNull();
  });

  it('재개하면 today 전날로 워터마크가 옮겨진다(소급 없음)', async () => {
    const routine = await seedRoutine();
    await state().pauseRoutine(routine.id);

    const ok = await state().resumeRoutine(routine.id, '2026-03-01' as DateKey);

    expect(ok).toBe(true);
    const saved = await getRepositories().routines.getById(routine.id);
    expect(saved?.active).toBe(true);
    expect(saved?.fillFloor).toBe('2026-02-28');
  });

  it('종료일이 있는 루틴은 중지할 수 없다(R7-a) — 문구가 뜨고 저장소는 안 바뀐다', async () => {
    const routine = await seedRoutine({ endDate: '2026-02-01' as DateKey });

    const ok = await state().pauseRoutine(routine.id);

    expect(ok).toBe(false);
    expect(state().error).toBe('종료일이 있는 루틴은 중지·재개할 수 없어요');
    const saved = await getRepositories().routines.getById(routine.id);
    expect(saved?.active).toBe(true);
  });
});

describe('reorderRoutine (R13)', () => {
  const 어제 = addCivilDays(FIXTURE_DATE, -1);
  const 내일 = addCivilDays(FIXTURE_DATE, 1);

  /** 루틴 인스턴스(`routineId` 있음)를 저장소에 직접 심는다 — 슬롯은 `order` 다. */
  async function seedInstance(
    seq: number,
    routine: Routine,
    date: DateKey,
    order: number,
    done = false,
  ) {
    const todo = makeTodo({ seq, title: routine.title, routineId: routine.id, date, order, done });
    await getRepositories().todos.upsert(adopt(todo));
    return todo;
  }

  it('루틴 행과 오늘 이후 인스턴스가 한 트랜잭션(dataset.write 1회)으로 나가고 과거는 안 건드린다', async () => {
    const 운동 = await seedRoutine({ title: '운동' });
    const 독서 = await seedRoutine({ title: '독서' });
    // 오늘·내일 보드: 운동(0)·독서(1). 어제 보드도 같은 모양 — 과거는 그대로여야 한다.
    for (const [seqBase, date] of [
      [10, 어제],
      [20, FIXTURE_DATE],
      [30, 내일],
    ] as const) {
      await seedInstance(seqBase, 운동, date, 0);
      await seedInstance(seqBase + 1, 독서, date, 1);
    }
    const write = vi.spyOn(repos.dataset, 'write');
    const before = state().writeRevision;

    const ok = await state().reorderRoutine(독서.id, 0, FIXTURE_DATE);

    expect(ok).toBe(true);
    expect(state().writeRevision).toBe(before + 1);
    expect(write).toHaveBeenCalledTimes(1);
    const writes = write.mock.calls[0][0];
    // 상한: 루틴 n(2, 둘 다 order 를 처음 받는다) + 오늘 이후 인스턴스(오늘 2 + 내일 2) = 6.
    expect(writes.filter((w) => w.table === 'routines')).toHaveLength(2);
    expect(writes.filter((w) => w.table === 'todos')).toHaveLength(4);

    const routines = await getRepositories().routines.list();
    expect(routines.map((routine) => [routine.title, routine.order])).toEqual([
      ['독서', 0],
      ['운동', 1],
    ]);
    for (const date of [FIXTURE_DATE, 내일]) {
      const board = await getRepositories().todos.listByDate(date);
      expect(board.map((todo) => [todo.title, todo.order])).toEqual([
        ['독서', 0],
        ['운동', 1],
      ]);
    }
    const past = await getRepositories().todos.listByDate(어제);
    expect(past.map((todo) => [todo.title, todo.order, todo.rev])).toEqual([
      ['운동', 0, 1],
      ['독서', 1, 1],
    ]);
  });

  it('보고 있는 날짜의 인스턴스는 메모리(byId)에도 바로 반영된다 — 보드가 즉시 그 순서다', async () => {
    const 운동 = await seedRoutine({ title: '운동' });
    const 독서 = await seedRoutine({ title: '독서' });
    await seedInstance(1, 운동, FIXTURE_DATE, 0);
    await seedInstance(2, 독서, FIXTURE_DATE, 1);
    await state().loadDate(FIXTURE_DATE);

    await state().reorderRoutine(독서.id, 0, FIXTURE_DATE);

    const orders = Object.values(state().byId)
      .sort((a, b) => a.order - b.order)
      .map((todo) => todo.title);
    expect(orders).toEqual(['독서', '운동']);
  });

  it('완료된 인스턴스와 손으로 옮긴 일반 투두는 자리를 지킨다(슬롯 집합 보존)', async () => {
    const 운동 = await seedRoutine({ title: '운동' });
    const 독서 = await seedRoutine({ title: '독서' });
    await seedInstance(1, 운동, FIXTURE_DATE, 0);
    await getRepositories().todos.upsert(adopt(makeTodo({ seq: 2, title: '일반', order: 1 })));
    await seedInstance(3, 독서, FIXTURE_DATE, 2);
    await seedInstance(4, 운동, 내일, 0, true);
    await seedInstance(5, 독서, 내일, 1);

    await state().reorderRoutine(독서.id, 0, FIXTURE_DATE);

    const today = await getRepositories().todos.listByDate(FIXTURE_DATE);
    expect(today.map((todo) => [todo.title, todo.order])).toEqual([
      ['독서', 0],
      ['일반', 1],
      ['운동', 2],
    ]);
    // 내일은 미완료 인스턴스가 하나뿐이라(운동은 완료) 아무것도 안 바뀐다.
    const tomorrow = await getRepositories().todos.listByDate(내일);
    expect(tomorrow.map((todo) => [todo.title, todo.order, todo.rev])).toEqual([
      ['운동', 0, 1],
      ['독서', 1, 1],
    ]);
  });

  it('없는 id 면 false 이고 아무것도 쓰지 않는다', async () => {
    await seedRoutine({ title: '운동' });
    const write = vi.spyOn(repos.dataset, 'write');

    expect(await state().reorderRoutine('없는-id', 0, FIXTURE_DATE)).toBe(false);
    expect(write).not.toHaveBeenCalled();
    expect(state().error).toBeNull();
  });
});

describe('removeRoutine (R10)', () => {
  it('삭제하면 메모리에서 빠지고 저장소에는 툼스톤이 남는다', async () => {
    const routine = await seedRoutine();
    await state().loadRoutines();
    expect(state().routines[routine.id]).toBeDefined();

    const ok = await state().removeRoutine(routine.id);

    expect(ok).toBe(true);
    expect(state().routines[routine.id]).toBeUndefined();
    expect(await getRepositories().routines.getById(routine.id)).toBeUndefined(); // 조회는 툼스톤을 감춘다
  });
});
