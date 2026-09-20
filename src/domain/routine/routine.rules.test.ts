import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import type { Routine } from '@/domain/routine/routine';
import {
  compareRoutines,
  createRoutine,
  deleteRoutine,
  pauseRoutine,
  resumeRoutine,
  shouldMaterialize,
} from '@/domain/routine/routine.rules';

import { FIXTURE_INSTANT, fixedDeps, fixtureId } from '@/test/fixtures/deps';
import { FIXTURE_CATEGORY_ID } from '@/test/fixtures/todo';

const deps = fixedDeps();

/** 무기한 루틴 한 건(종료일 없음). override 로 종료일·활성 여부 등을 바꾼다. */
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
    materializedThrough: '2026-01-14' as DateKey,
    ...overrides,
  };
}

describe('createRoutine (R5)', () => {
  it('종료일 없이 만들면 무기한이고 materializedThrough 는 시작일 전날이다', () => {
    const routine = createRoutine(
      {
        title: ' 운동 ',
        categoryId: FIXTURE_CATEGORY_ID,
        recurrence: { type: 'weekly', daysOfWeek: [4] },
        startDate: '2026-01-15' as DateKey,
      },
      deps,
    );
    expect(routine.title).toBe('운동');
    expect(routine.active).toBe(true);
    expect(routine.materializedThrough).toBe('2026-01-14');
    expect('endDate' in routine).toBe(false);
  });

  it('종료일을 주면 그대로 저장된다 (R2)', () => {
    const routine = createRoutine(
      {
        title: '독서',
        categoryId: FIXTURE_CATEGORY_ID,
        recurrence: { type: 'weekly', daysOfWeek: [2, 4] },
        startDate: '2026-01-15' as DateKey,
        endDate: '2026-02-01' as DateKey,
      },
      deps,
    );
    expect(routine.endDate).toBe('2026-02-01');
  });

  it('종료일이 시작일보다 이르면 ROUTINE_DATE_RANGE_INVALID', () => {
    expect(() =>
      createRoutine(
        {
          title: '운동',
          categoryId: FIXTURE_CATEGORY_ID,
          recurrence: { type: 'weekly', daysOfWeek: [4] },
          startDate: '2026-01-15' as DateKey,
          endDate: '2026-01-14' as DateKey,
        },
        deps,
      ),
    ).toThrow(expect.objectContaining({ code: 'ROUTINE_DATE_RANGE_INVALID' }));
  });

  it('반복 패턴이 비어 있으면 ROUTINE_RECURRENCE_INVALID', () => {
    expect(() =>
      createRoutine(
        {
          title: '운동',
          categoryId: FIXTURE_CATEGORY_ID,
          recurrence: { type: 'weekly', daysOfWeek: [] },
          startDate: '2026-01-15' as DateKey,
        },
        deps,
      ),
    ).toThrow(expect.objectContaining({ code: 'ROUTINE_RECURRENCE_INVALID' }));
  });

  it('제목이 비어 있으면 TODO_TITLE_REQUIRED(투두 검증을 재사용한다)', () => {
    expect(() =>
      createRoutine(
        {
          title: '   ',
          categoryId: FIXTURE_CATEGORY_ID,
          recurrence: { type: 'weekly', daysOfWeek: [4] },
          startDate: '2026-01-15' as DateKey,
        },
        deps,
      ),
    ).toThrow(expect.objectContaining({ code: 'TODO_TITLE_REQUIRED' }));
  });
});

describe('shouldMaterialize (R6)', () => {
  it('활성·범위 안·요일이 맞으면 true', () => {
    const routine = makeRoutine();
    expect(shouldMaterialize(routine, '2026-01-22' as DateKey)).toBe(true); // 다음 목요일
  });

  it('비활성이면 false', () => {
    const routine = makeRoutine({ active: false });
    expect(shouldMaterialize(routine, '2026-01-22' as DateKey)).toBe(false);
  });

  it('시작일 이전이거나 종료일 이후면 false', () => {
    const routine = makeRoutine({ endDate: '2026-01-29' as DateKey });
    expect(shouldMaterialize(routine, '2026-01-08' as DateKey)).toBe(false); // 시작일 이전 목요일
    expect(shouldMaterialize(routine, '2026-02-05' as DateKey)).toBe(false); // 종료일 이후 목요일
    expect(shouldMaterialize(routine, '2026-01-29' as DateKey)).toBe(true); // 종료일 당일은 포함
  });

  it('요일이 안 맞으면 false', () => {
    const routine = makeRoutine();
    expect(shouldMaterialize(routine, '2026-01-16' as DateKey)).toBe(false); // 금요일
  });
});

describe('pauseRoutine · resumeRoutine (R7·R7-a)', () => {
  it('중지하면 active 만 false 가 된다', () => {
    const routine = makeRoutine();
    const paused = pauseRoutine(routine, deps);
    expect(paused.active).toBe(false);
    expect(paused.materializedThrough).toBe(routine.materializedThrough);
    expect(paused.rev).toBe(routine.rev + 1);
  });

  it('재개하면 materializedThrough 가 today 전날로 옮겨진다(소급 없음)', () => {
    // 오래 중지돼 있던 루틴 — materializedThrough 가 today 보다 훨씬 앞이다.
    const routine = makeRoutine({ active: false, materializedThrough: '2026-01-01' as DateKey });
    const resumed = resumeRoutine(routine, '2026-03-01' as DateKey, deps);
    expect(resumed.active).toBe(true);
    expect(resumed.materializedThrough).toBe('2026-02-28'); // today(3/1) 전날 — 1/1~2/28 구간은 영영 안 채운다
  });

  it('재개 시 이미 today 전날보다 앞선 값이 아니면(더 최근이면) 뒤로 물러나지 않는다', () => {
    const routine = makeRoutine({
      active: false,
      materializedThrough: '2026-03-10' as DateKey, // today(3/1) 보다도 나중
    });
    const resumed = resumeRoutine(routine, '2026-03-01' as DateKey, deps);
    expect(resumed.materializedThrough).toBe('2026-03-10');
  });

  it('종료일이 있는 루틴은 중지·재개할 수 없다(R7-a)', () => {
    const routine = makeRoutine({ endDate: '2026-02-01' as DateKey });
    expect(() => pauseRoutine(routine, deps)).toThrow(
      expect.objectContaining({ code: 'ROUTINE_NOT_INDEFINITE' }),
    );
    expect(() => resumeRoutine(routine, '2026-03-01' as DateKey, deps)).toThrow(
      expect.objectContaining({ code: 'ROUTINE_NOT_INDEFINITE' }),
    );
  });
});

describe('deleteRoutine (R10)', () => {
  it('소프트 삭제만 한다 — Todo.routineId 연결은 이 함수가 손댈 필드가 아니다', () => {
    const routine = makeRoutine();
    const deleted = deleteRoutine(routine, deps);
    expect(deleted.deletedAt).toBe(FIXTURE_INSTANT);
  });
});

describe('compareRoutines', () => {
  it('createdAt 오름차순, 동률이면 id 오름차순', () => {
    const a = makeRoutine({ id: 'b', createdAt: '2026-01-01T00:00:00.000Z' });
    const b = makeRoutine({ id: 'a', createdAt: '2026-01-01T00:00:00.000Z' });
    const c = makeRoutine({ id: 'z', createdAt: '2025-01-01T00:00:00.000Z' });
    expect([a, b, c].sort(compareRoutines)).toEqual([c, b, a]);
  });
});
