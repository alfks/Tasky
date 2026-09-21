import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import type { Routine } from '@/domain/routine/routine';
import { planRoutineFill, resolveImmediateFillThrough } from '@/domain/routine/routine-fill';
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

  it('결과에는 투두만 실리고 루틴 로우는 없다 — 채우기가 로우를 쓰지 않는다(ADR-0018)', () => {
    const routine = makeRoutine();
    const plan = planRoutineFill(
      { routine, through: '2026-01-29' as DateKey, existingIds: new Set() },
      deps,
    );
    expect(plan).not.toHaveProperty('routine');
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

  it('fillFloor 가 고정이어도, 이미 채운 슬롯을 existingIds 로 넘기면 같은 구간을 다시 만들지 않는다(멱등)', () => {
    const routine = makeRoutine();
    const first = planRoutineFill(
      { routine, through: '2026-01-15' as DateKey, existingIds: new Set() },
      deps,
    );
    expect(first?.todos.map((t) => t.date)).toEqual(['2026-01-15']);

    const existingIds = new Set((first?.todos ?? []).map((t) => t.id));
    const second = planRoutineFill(
      { routine, through: '2026-01-22' as DateKey, existingIds },
      deps,
    );
    // fillFloor 는 전진하지 않으므로 from 은 여전히 1/15 다 — 1/15 는 existingIds 에 있어 건너뛴다.
    expect(second?.todos.map((t) => t.date)).toEqual(['2026-01-22']);
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
