// 무기한 루틴 등록·되돌리기·지연 생성 배선 (routine.md R2~R7·R10·R11, ADR-0017). 저장소 계층의
// 워터마크 멱등성 자체는 `routine-fill.contract.ts` 가 이미 memory·indexeddb 양쪽에서 고정한다 —
// 여기서 새로 잡는 것은 **스토어 배선**: `commitWrites` 직렬 큐를 타서 경합이 안 나는지, 등록이
// `Routine` 레코드를 항상 남기는지, 되돌리기가 레코드까지 지우는지, 관리 상태(중지·카테고리 삭제)가
// 이 경로에서도 지켜지는지다.
import { beforeEach, describe, expect, it } from 'vitest';

import { addCivilDays, dayOfWeekOf } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import { adopt, markDeleted } from '@/domain/meta';
import { pauseRoutine } from '@/domain/routine/routine.rules';

import { getRepositories, setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { createTodoStore, type TodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { fixedDeps, FIXTURE_DATE } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID } from '@/test/fixtures/todo';

type Store = ReturnType<typeof createTodoStore>;

// FIXTURE_DATE = 2026-01-15(목).
const WEEKLY_RECURRENCE = { type: 'weekly' as const, daysOfWeek: [dayOfWeekOf(FIXTURE_DATE)] };

let store: Store;

beforeEach(async () => {
  setRepositories(createMemoryRepositories());
  await getRepositories().categories.upsert(adopt(makeCategory({ seq: 1 })));
  store = createTodoStore(fixedDeps());
});

const state = (): TodoStore => store.getState();

describe('createRoutine — 무기한 등록(routine.md R2~R5)', () => {
  it('즉시 채우기 구간에 맞는 날짜가 없어도(0건) 오류 없이 Routine 을 저장한다', async () => {
    // 보이는 범위를 먼저 안 열면(방문 전) 즉시 채우기 상한은 시작일 하루뿐이고, 그 하루가
    // 반복 요일과 다르면 0건이다 — 그래도 성공이어야 한다(R4·R5, 이번 라운드에서 잡힌 회귀).
    const mondayStart = addCivilDays(FIXTURE_DATE, 4) as DateKey; // 목요일 반복 패턴의 월요일 시작
    const ids = await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 명상',
      startDate: mondayStart,
      recurrence: WEEKLY_RECURRENCE,
      // endDate 없음 = 무기한.
    });
    expect(ids).toEqual([]);
    expect(state().error).toBeNull();

    const saved = await getRepositories().routines.list({ includeInactive: true });
    expect(saved).toHaveLength(1);
    expect(saved[0]?.active).toBe(true);
    expect(saved[0]?.materializedThrough).toBe(mondayStart); // 시작일 하루만 즉시 채우기 대상이었다
  });

  it('보이는 범위 끝까지 즉시 채운다(R3) — 시작일이 그 끝보다 뒤면 시작일 하루만(구간 보정)', async () => {
    await state().materializeRoutines({
      from: FIXTURE_DATE,
      to: '2026-01-29' as DateKey,
      today: FIXTURE_DATE,
    });

    const ids = await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 명상',
      startDate: FIXTURE_DATE,
      recurrence: WEEKLY_RECURRENCE,
    });
    expect(ids).not.toBe(false);
    expect(ids).toHaveLength(3); // 1/15·1/22·1/29 세 목요일

    const saved = await getRepositories().routines.list();
    expect(saved[0]?.materializedThrough).toBe('2026-01-29');
  });
});

describe('undoRoutine — 되돌리기는 인스턴스와 루틴 레코드를 함께 지운다', () => {
  it('되돌린 뒤 같은 구간을 다시 채워도 재생성되지 않는다', async () => {
    const ids = (await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 명상',
      startDate: FIXTURE_DATE,
      endDate: '2026-01-29' as DateKey,
      recurrence: WEEKLY_RECURRENCE,
    })) as string[];
    expect(ids).toHaveLength(3);
    expect(await getRepositories().routines.list({ includeInactive: true })).toHaveLength(1);

    const ok = await state().undoRoutine(ids);
    expect(ok).toBe(true);
    expect(await getRepositories().routines.list({ includeInactive: true })).toHaveLength(0);
    expect(
      await getRepositories().todos.listByDateRange(FIXTURE_DATE, '2026-01-29' as DateKey),
    ).toHaveLength(0);

    // 루틴 레코드가 지워졌으니 그 뒤 방문(materializeRoutines)이 다시 채우지 않는다 — 인스턴스만
    // 지우고 레코드를 남겼다면 여기서 3개가 되살아난다.
    await state().materializeRoutines({
      from: FIXTURE_DATE,
      to: '2026-02-28' as DateKey,
      today: FIXTURE_DATE,
    });
    expect(
      await getRepositories().todos.listByDateRange(FIXTURE_DATE, '2026-02-28' as DateKey),
    ).toHaveLength(0);
  });
});

describe('materializeRoutines — 지연 생성 배선(routine.md R6·R7·R11)', () => {
  it('같은 범위를 동시에 두 번 열어도(경합) 중복 생성이 없다 — commitWrites 직렬 큐', async () => {
    await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 명상',
      startDate: FIXTURE_DATE,
      recurrence: WEEKLY_RECURRENCE,
    });

    const range = { from: FIXTURE_DATE, to: '2026-02-28' as DateKey, today: FIXTURE_DATE };
    await Promise.all([state().materializeRoutines(range), state().materializeRoutines(range)]);

    const todos = await getRepositories().todos.listByDateRange(
      FIXTURE_DATE,
      '2026-02-28' as DateKey,
    );
    const thursdays = todos.filter((todo) => todo.title === '아침 명상');
    // 1/15~2/28 사이 목요일은 정확히 7개 — 두 번 열었다고 14개가 되면 큐가 안 걸린 것이다.
    expect(thursdays).toHaveLength(7);
  });

  it('중지된 루틴은 채우지 않는다(R7)', async () => {
    // 등록 자체가 시작일(목요일) 하루를 즉시 채우므로(R3, visibleRange 없음), 그 뒤 구간만 본다.
    await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 명상',
      startDate: FIXTURE_DATE,
      recurrence: WEEKLY_RECURRENCE,
    });
    const [routine] = await getRepositories().routines.list();
    await getRepositories().routines.upsert(pauseRoutine(routine!, fixedDeps()));

    await state().materializeRoutines({
      from: FIXTURE_DATE,
      to: '2026-02-28' as DateKey,
      today: FIXTURE_DATE,
    });

    const after = addCivilDays(FIXTURE_DATE, 1) as DateKey;
    expect(
      await getRepositories().todos.listByDateRange(after, '2026-02-28' as DateKey),
    ).toHaveLength(0);
  });

  it('가리키는 카테고리가 삭제되면 채우지 않는다(R11) — 루틴 레코드 자체는 바뀌지 않는다', async () => {
    await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 명상',
      startDate: FIXTURE_DATE,
      recurrence: WEEKLY_RECURRENCE,
    });
    const category = (await getRepositories().categories.list())[0]!;
    await getRepositories().categories.upsert(markDeleted(category, fixedDeps().now()));

    await state().materializeRoutines({
      from: FIXTURE_DATE,
      to: '2026-02-28' as DateKey,
      today: FIXTURE_DATE,
    });

    const after = addCivilDays(FIXTURE_DATE, 1) as DateKey;
    expect(
      await getRepositories().todos.listByDateRange(after, '2026-02-28' as DateKey),
    ).toHaveLength(0);
    const [routine] = await getRepositories().routines.list();
    expect(routine?.active).toBe(true); // 레코드는 그대로 — categoryId 도 비지 않는다
  });

  it('오늘부터 366일을 넘는 구간은 채우지 않는다(지평선)', async () => {
    await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 명상',
      startDate: FIXTURE_DATE,
      recurrence: WEEKLY_RECURRENCE,
    });

    const farFuture = addCivilDays(FIXTURE_DATE, 400) as DateKey;
    await state().materializeRoutines({ from: FIXTURE_DATE, to: farFuture, today: FIXTURE_DATE });

    const [routine] = await getRepositories().routines.list();
    expect(routine?.materializedThrough).toBe(addCivilDays(FIXTURE_DATE, 366));
  });
});
