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

import { MATERIALIZE_HORIZON_DAYS } from '@/features/todo/store/todo-routine-fill';
import { createTodoStore, type TodoStore } from '@/features/todo/store/todo-store';
import { makeCategory } from '@/test/fixtures/category';
import { fixedDeps, FIXTURE_DATE } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID, makeTodo } from '@/test/fixtures/todo';

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
    // 즉시 채우기 구간이 시작일 하루뿐이라(방문 전) fillFloor 는 그 하루까지만 전진한다(PR #121
    // 리뷰 Blocker 이후 임시 복원 — routine-fill.ts 상단 주석).
    expect(saved[0]?.fillFloor).toBe(mondayStart);
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

    // 즉시 채운 구간 끝(보이는 범위 끝, 1/29)까지 fillFloor 가 전진한다(임시 복원, PR #121 리뷰
    // Blocker).
    const saved = await getRepositories().routines.list();
    expect(saved[0]?.fillFloor).toBe('2026-01-29');
  });
});

describe('createRoutine — 종료일 있는 등록이 전부 중복이면 Routine 도 안 남는다(리뷰 Major 1)', () => {
  it('오류 후 저장소에 Routine 이 하나도 없다 — 재시도해도 유령이 쌓이지 않는다', async () => {
    // 등록 대상 항목 자신을 미리 저장소에 넣어, 반복 조건에 맞는 유일한 날짜가 이미 있게 만든다
    // (기존 todo-routine.test.ts 의 "맞는 날짜가 없으면…" 픽스처와 같은 모양).
    await getRepositories().todos.upsert(adopt(makeTodo({ title: '아침 명상' })));

    const ids = await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 명상',
      startDate: FIXTURE_DATE,
      endDate: FIXTURE_DATE,
      recurrence: WEEKLY_RECURRENCE,
    });
    expect(ids).toEqual([]); // 성공(빈 배열) — 다이얼로그가 이걸 "전부 중복" 오류로 안내한다.

    // 리뷰 실측 그대로: 오류를 낸 뒤 routines.list() 가 0건이어야 한다(main 과 같은 "아무것도 안
    // 남긴다"). 세 번 재시도해도(사용자가 버튼을 연타해도) 유령이 쌓이지 않는지까지 확인한다.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      await state().createRoutine({
        categoryId: FIXTURE_CATEGORY_ID,
        title: '아침 명상',
        startDate: FIXTURE_DATE,
        endDate: FIXTURE_DATE,
        recurrence: WEEKLY_RECURRENCE,
      });
    }
    expect(await getRepositories().routines.list({ includeInactive: true })).toEqual([]);
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

  it('소프트 삭제한 인스턴스는 더 넓은 범위를 재방문해도 부활하지 않는다(PR #121 리뷰 Blocker)', async () => {
    // 좁은 범위를 먼저 방문해 1/15·1/22·1/29 세 목요일을 채운다(1/15 는 등록 즉시 채우기).
    await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 명상',
      startDate: FIXTURE_DATE,
      recurrence: WEEKLY_RECURRENCE,
    });
    await state().materializeRoutines({
      from: FIXTURE_DATE,
      to: '2026-01-29' as DateKey,
      today: FIXTURE_DATE,
    });
    const before = await getRepositories().todos.listByDateRange(
      FIXTURE_DATE,
      '2026-01-29' as DateKey,
    );
    expect(before.map((t) => t.date).sort()).toEqual(['2026-01-15', '2026-01-22', '2026-01-29']);

    // 1/22 인스턴스 한 건을 소프트 삭제한다(사용자가 지움).
    const target = before.find((t) => t.date === '2026-01-22')!;
    await getRepositories().todos.upsert(markDeleted(target, fixedDeps().now()));

    // 더 넓은 범위(2/28 까지)를 재방문한다 — fillFloor 가 고정이면 1/15~1/29 구간을 다시 훑어
    // 1/22 가 같은 슬롯 id 로 되살아난다(회귀 재현 지점).
    await state().materializeRoutines({
      from: FIXTURE_DATE,
      to: '2026-02-28' as DateKey,
      today: FIXTURE_DATE,
    });

    const after = await getRepositories().todos.listByDateRange(
      FIXTURE_DATE,
      '2026-02-28' as DateKey,
    );
    const thursdayDates = after.filter((t) => t.title === '아침 명상').map((t) => t.date);
    expect(thursdayDates).not.toContain('2026-01-22'); // 부활 0건
    // 1/15·1/29·2/5·2/12·2/19·2/26 여섯 개(지운 1/22 는 제외) — 일곱이면 부활한 것이다.
    expect(thursdayDates.sort()).toEqual([
      '2026-01-15',
      '2026-01-29',
      '2026-02-05',
      '2026-02-12',
      '2026-02-19',
      '2026-02-26',
    ]);
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

    const horizon = addCivilDays(FIXTURE_DATE, MATERIALIZE_HORIZON_DAYS) as DateKey;
    const created = await getRepositories().todos.listByDateRange(FIXTURE_DATE, farFuture);
    expect(created.length).toBeGreaterThan(0);
    expect(created.every((todo) => todo.date <= horizon)).toBe(true); // 지평선을 넘는 날짜는 없다

    // fillFloor 는 실제로 채운 구간 끝(지평선)까지만 전진한다 — 지평선 너머는 다음 방문이 마저
    // 채운다(임시 복원, PR #121 리뷰 Blocker).
    const [routine] = await getRepositories().routines.list();
    expect(routine?.fillFloor).toBe(horizon);
  });
});

describe('materializeRoutines — 낭비 방지 캐시(리뷰 Major 2)', () => {
  /** `routines.list` 호출 수를 세는 저장소로 바꿔 끼운다. */
  function countRoutineListCalls(): () => number {
    const base = getRepositories();
    let calls = 0;
    setRepositories({
      ...base,
      routines: {
        ...base.routines,
        list: (options) => {
          calls += 1;
          return base.routines.list(options);
        },
      },
    });
    return () => calls;
  }

  it('같은(또는 더 좁은) 범위를 아무 쓰기 없이 다시 열면 저장소를 다시 읽지 않는다', async () => {
    const listCalls = countRoutineListCalls();
    const range = { from: FIXTURE_DATE, to: '2026-02-28' as DateKey, today: FIXTURE_DATE };

    await state().materializeRoutines(range);
    expect(listCalls()).toBe(1);

    await state().materializeRoutines(range); // 같은 범위, 그 사이 쓰기 없음
    expect(listCalls()).toBe(1); // 저장소를 다시 읽지 않았다

    const narrower = { from: FIXTURE_DATE, to: '2026-01-20' as DateKey, today: FIXTURE_DATE };
    await state().materializeRoutines(narrower); // 더 좁은 범위도 스킵된다
    expect(listCalls()).toBe(1);
  });

  it('그 사이에 루틴을 등록하면(writeRevision 이 오르면) 다시 읽는다', async () => {
    const listCalls = countRoutineListCalls();
    const range = { from: FIXTURE_DATE, to: '2026-02-28' as DateKey, today: FIXTURE_DATE };

    await state().materializeRoutines(range);
    expect(listCalls()).toBe(1);

    await state().createRoutine({
      categoryId: FIXTURE_CATEGORY_ID,
      title: '아침 명상',
      startDate: FIXTURE_DATE,
      recurrence: WEEKLY_RECURRENCE,
    });

    await state().materializeRoutines(range);
    expect(listCalls()).toBe(2); // 새 쓰기가 있었으니 다시 읽는다
  });

  it('전에 처리한 to 보다 먼 범위로 넘어가면 다시 읽는다', async () => {
    const listCalls = countRoutineListCalls();

    await state().materializeRoutines({
      from: FIXTURE_DATE,
      to: '2026-01-20' as DateKey,
      today: FIXTURE_DATE,
    });
    expect(listCalls()).toBe(1);

    await state().materializeRoutines({
      from: FIXTURE_DATE,
      to: '2026-02-28' as DateKey,
      today: FIXTURE_DATE,
    });
    expect(listCalls()).toBe(2);
  });

  it('revision 인자가 바뀌면(writeRevision 은 그대로여도) 다시 읽는다(리뷰 m2)', async () => {
    // `revision` 은 셸이 writeRevision + dataRevision 을 합쳐 넘긴다(ShellHeader#useSummaryRevision).
    // 백업 가져오기는 writeRevision 을 안 올리고 dataRevision 만 올리므로, 이 스토어 혼자 보는
    // writeRevision 만으로는 가져오기 뒤 재확인이 늦는다 — revision 인자로 그 신호까지 받는다.
    const listCalls = countRoutineListCalls();
    const range = { from: FIXTURE_DATE, to: '2026-02-28' as DateKey, today: FIXTURE_DATE };

    await state().materializeRoutines({ ...range, revision: 1 });
    expect(listCalls()).toBe(1);

    await state().materializeRoutines({ ...range, revision: 1 }); // 같은 revision — 스킵
    expect(listCalls()).toBe(1);

    await state().materializeRoutines({ ...range, revision: 2 }); // writeRevision 은 안 올랐어도
    expect(listCalls()).toBe(2); // revision 이 바뀌었으니 다시 읽는다
  });
});
