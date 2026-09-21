import { describe, expect, it } from 'vitest';

import { addCivilDays } from '@/domain/date/civil';
import type { DateKey } from '@/domain/date/date-key';
import type { Routine } from '@/domain/routine/routine';
import {
  candidateFillDates,
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

  it('루틴 로우를 돌려주지 않는다(ADR-0018 §결정 3) — fillFloor 를 옮기지 않으므로 배경 채우기가 아웃박스에 실릴 것이 없다(F2 방어)', () => {
    const routine = makeRoutine();
    const plan = planRoutineFill(
      { routine, through: '2026-01-29' as DateKey, existingIds: new Set() },
      deps,
    );
    expect(plan).not.toHaveProperty('routine');
    expect(Object.keys(plan ?? {})).toEqual(['todos']);
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

  it('fillFloor 가 얼어 있어도 소프트 삭제한 슬롯은 existingIds(툼스톤 포함)가 있으면 부활하지 않는다', () => {
    // fillFloor 를 안 옮기므로(ADR-0018 §결정 3) 재방문마다 같은 from(fillFloor+1)부터 다시 훑는다 —
    // 1/15 슬롯이 소프트 삭제됐어도 existingIds 에 그 슬롯 id 가 들어 있으면(호출부가
    // `SyncRepository.existingIds` 툼스톤 포함 조회로 넘긴다) 다시 만들지 않는다.
    const routine = makeRoutine();
    const deletedSlot = routineInstanceSlotId(routine.id, '2026-01-15' as DateKey);

    const revisit = planRoutineFill(
      {
        routine, // fillFloor 그대로(전진 없음) — 두 번째 호출도 1/16(fillFloor+1)부터 훑는다.
        through: '2026-01-22' as DateKey,
        existingIds: new Set([deletedSlot]), // 툼스톤 포함 조회 결과를 흉내낸다.
      },
      deps,
    );
    expect(revisit?.todos.map((t) => t.date)).toEqual(['2026-01-22']); // 1/15 는 부활하지 않는다
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
    // fillFloor 를 옮기지 않으므로(ADR-0018 §결정 3) 훑지 않은 과거 구간은 다음 방문에도 그대로
    // 지평선 밖이다 — 영영 채워지지 않는다는 트레이드오프가 매 방문 같은 지평선으로 재확인된다.
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

describe('candidateFillDates — planRoutineFill 과 같은 창(ADR-0018)', () => {
  it('planRoutineFill 이 실제로 만드는 날짜와 정확히 같다(existingIds 를 비웠을 때)', () => {
    const routine = makeRoutine();
    const dates = candidateFillDates(routine, '2026-01-29' as DateKey);
    const plan = planRoutineFill(
      { routine, through: '2026-01-29' as DateKey, existingIds: new Set() },
      deps,
    );
    expect(dates).toEqual(plan?.todos.map((t) => t.date));
  });

  it('비활성이거나 구간이 뒤집히면 빈 배열이다(null 대신) — 호출부가 빈 후보로 안전하게 다룰 수 있다', () => {
    expect(candidateFillDates(makeRoutine({ active: false }), '2026-01-29' as DateKey)).toEqual([]);
    expect(
      candidateFillDates(
        makeRoutine({ startDate: '2026-02-01' as DateKey, fillFloor: '2026-01-31' as DateKey }),
        '2026-01-20' as DateKey,
      ),
    ).toEqual([]);
  });

  it('today 가 있으면 지평선을 똑같이 적용한다', () => {
    const today = '2026-09-21' as DateKey;
    const ancientFloor = addCivilDays(today, -1460) as DateKey;
    const routine = makeRoutine({
      recurrence: { type: 'weekly', daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
      startDate: addCivilDays(ancientFloor, -1000) as DateKey,
      fillFloor: ancientFloor,
    });
    const horizonFloor = addCivilDays(today, -FILL_BACKFILL_HORIZON_DAYS);

    const dates = candidateFillDates(routine, today, today);

    expect(dates[0]).toBe(horizonFloor);
    expect(dates.every((d) => d >= horizonFloor)).toBe(true);
  });
});
