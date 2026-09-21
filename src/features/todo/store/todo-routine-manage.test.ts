// 루틴 관리 액션 테스트(routine.md R7·R10). 저장소는 memory 구현이고 매 테스트 새로 주입한다.
import { beforeEach, describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import { touch } from '@/domain/meta';
import type { Routine } from '@/domain/routine/routine';
import { createRoutine } from '@/domain/routine/routine.rules';

import { getRepositories, setRepositories, type Repositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { createTodoStore, type TodoStore } from '@/features/todo/store/todo-store';
import { fixedDeps, FIXTURE_DATE } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID } from '@/test/fixtures/todo';

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
