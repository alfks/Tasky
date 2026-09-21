import { describe, expect, it } from 'vitest';

import { addCivilDays } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import type { Routine } from '@/domain/routine/routine';
import {
  FILL_BACKFILL_HORIZON_DAYS,
  planRoutineFill,
  resolveImmediateFillThrough,
} from '@/domain/routine/routine-fill';
import { routineInstanceSlotId } from '@/domain/routine/slot-id';

import { FIXTURE_INSTANT, fixedDeps, fixtureId } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID } from '@/test/fixtures/todo';

const deps = fixedDeps();

function makeRoutine(overrides: Partial<Routine> = {}): Routine {
  return {
    id: fixtureId('generated', 9),
    createdAt: FIXTURE_INSTANT,
    updatedAt: FIXTURE_INSTANT,
    rev: 1,
    title: '운동',
    categoryId: FIXTURE_CATEGORY_ID,
    recurrence: { type: 'weekly', daysOfWeek: [4] }, // 목요일
    startDate: '2026-01-15' as DateKey,
    active: true,
    fillFloor: '2026-01-14' as DateKey, // 시작일 전날
    ...overrides,
  };
}

describe('planRoutineFill — 슬롯 id 로 채우기 (routine.md R3·R4·R6, ADR-0018)', () => {
  it('구간 안의 반복 날짜마다 투두를 만든다', () => {
    const routine = makeRoutine();
    const plan = planRoutineFill(
      { routine, through: '2026-01-29' as DateKey, existingIds: new Set() },
      deps,
    );

    expect(plan).not.toBeNull();
    expect(plan?.todos.map((t) => t.date)).toEqual(['2026-01-15', '2026-01-22', '2026-01-29']);
    expect(plan?.todos.every((t) => t.routineId === routine.id)).toBe(true);
  });

  it('결과의 routine 은 fillFloor 가 through 까지 전진한 새 값이다(임시 복원, PR #121 리뷰 Blocker)', () => {
    const routine = makeRoutine();
    const plan = planRoutineFill(
      { routine, through: '2026-01-29' as DateKey, existingIds: new Set() },
      deps,
    );
    expect(plan?.routine.fillFloor).toBe('2026-01-29');
    expect(plan?.routine.rev).toBe(routine.rev + 1);
  });

  it('만든 투두의 id 는 routineInstanceSlotId(routine.id, date) 다(F1 방어)', () => {
    const routine = makeRoutine();
    const plan = planRoutineFill(
      { routine, through: '2026-01-15' as DateKey, existingIds: new Set() },
      deps,
    );
    expect(plan?.todos.map((t) => t.id)).toEqual([routineInstanceSlotId(routine.id, '2026-01-15')]);
  });

  it('결과가 0건이어도(패턴 자체는 유효) 오류가 아니다 (R4)', () => {
    // 구간(1/15~1/16) 안에 목요일이 없다 — 1/15 은 목요일이지만 아래에서 월요일(요일1)만 요구한다.
    const routine = makeRoutine({ recurrence: { type: 'weekly', daysOfWeek: [1] } });
    const plan = planRoutineFill(
      { routine, through: '2026-01-16' as DateKey, existingIds: new Set() },
      deps,
    );

    expect(plan).not.toBeNull();
    expect(plan?.todos).toEqual([]);
  });

  it('시작일이 through 보다 뒤면(구간이 뒤집히면) null', () => {
    const routine = makeRoutine({
      startDate: '2026-02-01' as DateKey,
      fillFloor: '2026-01-31' as DateKey,
    });
    const plan = planRoutineFill(
      { routine, through: '2026-01-20' as DateKey, existingIds: new Set() },
      deps,
    );
    expect(plan).toBeNull();
  });

  it('비활성 루틴은 null (R7 중지)', () => {
    const routine = makeRoutine({ active: false });
    const plan = planRoutineFill(
      { routine, through: '2026-01-29' as DateKey, existingIds: new Set() },
      deps,
    );
    expect(plan).toBeNull();
  });

  it('existingIds 에 이미 있는 슬롯 id 는 건너뛴다(슬롯 id dedup, 돌연변이 표적)', () => {
    const routine = makeRoutine();
    const existingIds = new Set([routineInstanceSlotId(routine.id, '2026-01-22' as DateKey)]);
    const plan = planRoutineFill({ routine, through: '2026-01-29' as DateKey, existingIds }, deps);
    expect(plan?.todos.map((t) => t.date)).toEqual(['2026-01-15', '2026-01-29']);
  });

  it('existingIds 는 살아 있는 로우든 툼스톤이든(호출부가 판정) 그대로 존중한다 — 이 함수는 멤버십만 본다', () => {
    // 이 함수는 existingIds 의 출처를 묻지 않는다 — 툼스톤을 포함해 넘기면 그 슬롯도 건너뛴다는
    // 뜻으로, 삭제된 인스턴스가 부활하지 않는 F2/F3 방어의 전제가 이것이다.
    const routine = makeRoutine();
    const tombstoneSlot = routineInstanceSlotId(routine.id, '2026-01-15' as DateKey);
    const plan = planRoutineFill(
      { routine, through: '2026-01-15' as DateKey, existingIds: new Set([tombstoneSlot]) },
      deps,
    );
    expect(plan?.todos).toEqual([]);
  });

  it('종료일이 있으면 through 를 넘지 않는다', () => {
    const routine = makeRoutine({ endDate: '2026-01-22' as DateKey });
    const plan = planRoutineFill(
      { routine, through: '2026-02-28' as DateKey, existingIds: new Set() },
      deps,
    );
    expect(plan?.todos.map((t) => t.date)).toEqual(['2026-01-15', '2026-01-22']);
  });

  it('호출부가 이전 plan.routine 을 넘기면 fillFloor 전진으로 지난 구간을 다시 훑지 않는다(부활 방지)', () => {
    const routine = makeRoutine();
    const first = planRoutineFill(
      { routine, through: '2026-01-15' as DateKey, existingIds: new Set() },
      deps,
    );
    expect(first?.todos.map((t) => t.date)).toEqual(['2026-01-15']);
    expect(first?.routine.fillFloor).toBe('2026-01-15');

    // 호출부가 first.routine(fillFloor 전진한 값)을 다음 호출에 넘긴다 — 실제 스토어 배선과 같다.
    // 1/15 슬롯이 그 사이 소프트 삭제돼 existingIds(살아 있는 로우만)에 없어도, from 이 이미
    // 1/16 이라 1/15 는 애초에 재계획 대상이 아니다.
    const second = planRoutineFill(
      { routine: first!.routine, through: '2026-01-22' as DateKey, existingIds: new Set() },
      deps,
    );
    expect(second?.todos.map((t) => t.date)).toEqual(['2026-01-22']);
  });

  it('여전히 existingIds 멤버십만으로도 멱등이다(같은 구간을 fillFloor 고정인 채 두 번 계획해도 중복 없음)', () => {
    const routine = makeRoutine();
    const first = planRoutineFill(
      { routine, through: '2026-01-15' as DateKey, existingIds: new Set() },
      deps,
    );
    const existingIds = new Set((first?.todos ?? []).map((t) => t.id));
    const second = planRoutineFill(
      { routine, through: '2026-01-22' as DateKey, existingIds },
      deps,
    );
    expect(second?.todos.map((t) => t.date)).toEqual(['2026-01-22']);
  });

  it('today 가 있으면 from 이 today - FILL_BACKFILL_HORIZON_DAYS 아래로 안 내려간다(Major 3)', () => {
    // fillFloor 가 today 로부터 4년(1,460일) 전에 멈춰 있는 한 번도 안 열린 매일(요일 전부) 루틴.
    const today = '2026-09-21' as DateKey;
    const ancientFloor = addCivilDays(today, -1460) as DateKey;
    const routine = makeRoutine({
      recurrence: { type: 'weekly', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
      startDate: addCivilDays(ancientFloor, -1000) as DateKey,
      fillFloor: ancientFloor,
    });

    const plan = planRoutineFill({ routine, through: today, existingIds: new Set(), today }, deps);

    expect(plan).not.toBeNull();
    const horizonFloor = addCivilDays(today, -FILL_BACKFILL_HORIZON_DAYS);
    expect(plan?.todos[0]?.date).toBe(horizonFloor); // 지평선보다 오래된 날짜는 후보에서 빠진다
    expect(plan?.todos.every((t) => t.date >= horizonFloor)).toBe(true);
    // 훑지 않은 과거 구간도 fillFloor 는 through 까지 전진한다 — 다시는 훑지 않는다(설계가 감수).
    expect(plan?.routine.fillFloor).toBe(today);
  });

  it('today 를 안 넘기면(즉시 등록 경로) 지평선 없이 fillFloor 그대로부터 훑는다', () => {
    const routine = makeRoutine({ fillFloor: '2026-01-14' as DateKey });
    const plan = planRoutineFill(
      { routine, through: '2026-01-15' as DateKey, existingIds: new Set() },
      deps,
    );
    expect(plan?.todos.map((t) => t.date)).toEqual(['2026-01-15']);
  });
});

describe('resolveImmediateFillThrough (R3 구간 보정)', () => {
  it('종료일이 있으면 그대로 돌려준다(R21 그대로, 상한 없음)', () => {
    expect(
      resolveImmediateFillThrough({
        startDate: '2026-01-15' as DateKey,
        endDate: '2026-06-01' as DateKey,
        visibleRangeEnd: '2026-01-20' as DateKey,
      }),
    ).toBe('2026-06-01');
  });

  it('종료일이 없고 보이는 범위 끝이 시작일보다 뒤면 그 끝을 쓴다', () => {
    expect(
      resolveImmediateFillThrough({
        startDate: '2026-01-15' as DateKey,
        visibleRangeEnd: '2026-01-21' as DateKey,
      }),
    ).toBe('2026-01-21');
  });

  it('시작일이 보이는 범위 끝보다 뒤면 시작일 당일 하루만 대상으로 본다(max 보정)', () => {
    // 오늘이 보이는 범위 끝(1/14)보다 시작일(1/20)이 뒤다 — 다음 주를 시작일로 고른 경우.
    const through = resolveImmediateFillThrough({
      startDate: '2026-01-20' as DateKey,
      visibleRangeEnd: '2026-01-14' as DateKey,
    });
    expect(through).toBe('2026-01-20');

    // 그 through 로 planRoutineFill 을 돌리면 실제로 시작일 하루만 채운다.
    const routine = makeRoutine({
      startDate: '2026-01-20' as DateKey,
      fillFloor: '2026-01-19' as DateKey,
      recurrence: { type: 'weekly', daysOfWeek: [2] }, // 화요일(1/20)
    });
    const plan = planRoutineFill({ routine, through, existingIds: new Set() }, deps);
    expect(plan?.todos.map((t) => t.date)).toEqual(['2026-01-20']);
  });
});
