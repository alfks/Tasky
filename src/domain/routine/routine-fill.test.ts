import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import type { Routine } from '@/domain/routine/routine';
import { planRoutineFill, resolveImmediateFillThrough } from '@/domain/routine/routine-fill';
import type { Todo } from '@/domain/todo/todo';

import { FIXTURE_INSTANT, fixedDeps, fixtureId } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID, makeTodo } from '@/test/fixtures/todo';

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
    materializedThrough: '2026-01-14' as DateKey, // 시작일 전날
    ...overrides,
  };
}

describe('planRoutineFill — 워터마크 구간 채우기 (routine.md R3·R4·R6, ADR-0017)', () => {
  it('구간 안의 반복 날짜마다 투두를 만들고 워터마크를 구간 끝으로 옮긴다', () => {
    const routine = makeRoutine();
    const plan = planRoutineFill({ routine, through: '2026-01-29' as DateKey, existing: [] }, deps);

    expect(plan).not.toBeNull();
    expect(plan?.todos.map((t) => t.date)).toEqual(['2026-01-15', '2026-01-22', '2026-01-29']);
    expect(plan?.todos.every((t) => t.routineId === routine.id)).toBe(true);
    expect(plan?.routine.materializedThrough).toBe('2026-01-29');
  });

  it('결과가 0건이어도(패턴 자체는 유효) 오류가 아니고 워터마크는 움직인다 (R4 회귀 — 이전 라운드 버그)', () => {
    // 구간(1/15~1/16) 안에 목요일이 없다 — 1/15 은 목요일이지만 아래에서 월요일(요일1)만 요구한다.
    const routine = makeRoutine({ recurrence: { type: 'weekly', daysOfWeek: [1] } });
    const plan = planRoutineFill({ routine, through: '2026-01-16' as DateKey, existing: [] }, deps);

    expect(plan).not.toBeNull();
    expect(plan?.todos).toEqual([]);
    expect(plan?.routine.materializedThrough).toBe('2026-01-16'); // 워터마크는 그래도 옮겨진다
  });

  it('시작일이 through 보다 뒤면(구간이 뒤집히면) null — 워터마크도 움직이지 않는다', () => {
    const routine = makeRoutine({
      startDate: '2026-02-01' as DateKey,
      materializedThrough: '2026-01-31' as DateKey,
    });
    const plan = planRoutineFill({ routine, through: '2026-01-20' as DateKey, existing: [] }, deps);
    expect(plan).toBeNull();
  });

  it('비활성 루틴은 null (R7 중지)', () => {
    const routine = makeRoutine({ active: false });
    const plan = planRoutineFill({ routine, through: '2026-01-29' as DateKey, existing: [] }, deps);
    expect(plan).toBeNull();
  });

  it('같은 날짜·카테고리에 정규화된 제목이 같은 투두가 이미 있으면 건너뛴다(dedup, R4)', () => {
    const routine = makeRoutine();
    const existing: Todo[] = [makeTodo({ date: '2026-01-22' as DateKey, title: ' 운동 ' })];
    const plan = planRoutineFill({ routine, through: '2026-01-29' as DateKey, existing }, deps);
    expect(plan?.todos.map((t) => t.date)).toEqual(['2026-01-15', '2026-01-29']);
  });

  it('종료일이 있으면 through 를 넘지 않는다', () => {
    const routine = makeRoutine({ endDate: '2026-01-22' as DateKey });
    const plan = planRoutineFill({ routine, through: '2026-02-28' as DateKey, existing: [] }, deps);
    expect(plan?.todos.map((t) => t.date)).toEqual(['2026-01-15', '2026-01-22']);
    expect(plan?.routine.materializedThrough).toBe('2026-01-22');
  });

  it('두 번째 호출(같은 워터마크에서 더 먼 through)은 이미 채운 구간을 다시 만들지 않는다(멱등성 핵심)', () => {
    const routine = makeRoutine();
    const first = planRoutineFill(
      { routine, through: '2026-01-15' as DateKey, existing: [] },
      deps,
    );
    expect(first?.todos.map((t) => t.date)).toEqual(['2026-01-15']);

    const advanced = first!.routine;
    const second = planRoutineFill(
      { routine: advanced, through: '2026-01-22' as DateKey, existing: [] },
      deps,
    );
    // 1/15 는 다시 나오지 않는다 — from 이 materializedThrough+1(=1/16)부터다.
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
      materializedThrough: '2026-01-19' as DateKey,
      recurrence: { type: 'weekly', daysOfWeek: [2] }, // 화요일(1/20)
    });
    const plan = planRoutineFill({ routine, through, existing: [] }, deps);
    expect(plan?.todos.map((t) => t.date)).toEqual(['2026-01-20']);
  });
});
