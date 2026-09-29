// 루틴 순서 규칙 테스트(routine.md R13) — 재매김·순위·인스턴스 슬롯 교환.
import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import {
  applyRoutineRank,
  rankRoutineInstances,
  reorderRoutines,
  routineRank,
} from '@/domain/routine/routine-rank';

import { fixedDeps } from '@/test/fixtures/deps';
import { makeRoutine } from '@/test/fixtures/routine';
import { makeTodo } from '@/test/fixtures/todo';

const deps = fixedDeps();

const 운동 = makeRoutine({ seq: 1, title: '운동', order: 0 });
const 독서 = makeRoutine({ seq: 2, title: '독서', order: 1 });
const 명상 = makeRoutine({ seq: 3, title: '명상', order: 2 });

describe('reorderRoutines (R13)', () => {
  it('옮긴 뒤 0..n-1 로 재매기고 바뀐 행만 돌려준다', () => {
    const changed = reorderRoutines([운동, 독서, 명상], 명상.id, 0, deps);

    expect(changed.map((routine) => [routine.title, routine.order])).toEqual([
      ['명상', 0],
      ['운동', 1],
      ['독서', 2],
    ]);
    expect(changed.every((routine) => routine.rev === 2)).toBe(true);
  });

  it('제자리로 옮기면 아무것도 바뀌지 않는다(빈 배열)', () => {
    expect(reorderRoutines([운동, 독서, 명상], 독서.id, 1, deps)).toEqual([]);
  });

  it('order 가 없는 옛 레코드가 섞여 있어도 이번에 전부 값을 받는다', () => {
    const 옛것 = makeRoutine({ seq: 4, title: '옛것', createdAt: '2025-01-01T00:00:00.000Z' });
    // 옛 레코드는 정렬상 맨 뒤(Infinity)에서 시작한다 — 그것을 맨 앞으로 옮긴다.
    const changed = reorderRoutines([운동, 독서, 옛것], 옛것.id, 0, deps);

    expect(changed.map((routine) => [routine.title, routine.order])).toEqual([
      ['옛것', 0],
      ['운동', 1],
      ['독서', 2],
    ]);
  });

  it('범위 밖 인덱스는 양끝으로 자른다', () => {
    expect(reorderRoutines([운동, 독서, 명상], 운동.id, 99, deps).map((r) => r.title)).toEqual([
      '독서',
      '명상',
      '운동',
    ]);
    expect(reorderRoutines([운동, 독서, 명상], 명상.id, -5, deps).map((r) => r.title)).toEqual([
      '명상',
      '운동',
      '독서',
    ]);
  });

  it('목록에 없는 id 는 ROUTINE_NOT_IN_LIST', () => {
    expect(() => reorderRoutines([운동, 독서], '없는-id', 0, deps)).toThrow(
      expect.objectContaining({ code: 'ROUTINE_NOT_IN_LIST' }),
    );
  });
});

describe('routineRank', () => {
  it('표준 정렬 순서대로 0부터 순위를 매긴다(order 없는 것은 뒤)', () => {
    const 옛것 = makeRoutine({ seq: 4, title: '옛것' });
    const rank = routineRank([독서, 옛것, 운동]);
    expect([...rank.entries()]).toEqual([
      [운동.id, 0],
      [독서.id, 1],
      [옛것.id, 2],
    ]);
  });
});

const DATE = '2026-01-15' as DateKey;

/** 한 그룹의 인스턴스·일반 투두 픽스처. `order` 가 슬롯이다. */
function instance(seq: number, routineId: string, order: number, done = false) {
  return makeTodo({ seq, title: `인스턴스 ${seq}`, routineId, order, done, date: DATE });
}

describe('applyRoutineRank (R13 — 이미 만들어진 인스턴스)', () => {
  const rank = routineRank([운동, 독서, 명상]);

  it('인스턴스들이 차지한 슬롯 집합은 그대로 두고 순위대로 앉힌다', () => {
    // 슬롯 0·2·5 를 명상·독서·운동이 차지하고 있다 → 운동·독서·명상 순으로 0·2·5.
    const group = [instance(1, 명상.id, 0), instance(2, 독서.id, 2), instance(3, 운동.id, 5)];

    const changed = applyRoutineRank(group, rank, deps);

    expect(changed.map((todo) => [todo.routineId, todo.order])).toEqual([
      [운동.id, 0],
      [명상.id, 5],
    ]);
    // 독서는 이미 가운데 슬롯(2)이라 안 바뀐다 — 바뀐 것만 돌려준다.
    expect(changed.find((todo) => todo.routineId === 독서.id)).toBeUndefined();
  });

  it('손으로 옮긴 일반 투두는 자리도 값도 건드리지 않는다', () => {
    const 일반 = makeTodo({ seq: 9, title: '일반', order: 1, date: DATE });
    const group = [instance(1, 독서.id, 0), 일반, instance(2, 운동.id, 2)];

    const changed = applyRoutineRank(group, rank, deps);

    expect(changed.map((todo) => [todo.id, todo.order])).toEqual([
      [group[2].id, 0],
      [group[0].id, 2],
    ]);
    expect(changed.some((todo) => todo.id === 일반.id)).toBe(false);
  });

  it('완료된 인스턴스는 건드리지 않고 슬롯에서도 뺀다', () => {
    const group = [instance(1, 독서.id, 0, true), instance(2, 명상.id, 1), instance(3, 운동.id, 2)];

    const changed = applyRoutineRank(group, rank, deps);

    expect(changed.map((todo) => [todo.routineId, todo.order])).toEqual([
      [운동.id, 1],
      [명상.id, 2],
    ]);
  });

  it('이미 순위대로면 빈 배열이고, 인스턴스가 하나뿐이어도 빈 배열이다', () => {
    expect(
      applyRoutineRank([instance(1, 운동.id, 0), instance(2, 독서.id, 1)], rank, deps),
    ).toEqual([]);
    expect(applyRoutineRank([instance(1, 명상.id, 3)], rank, deps)).toEqual([]);
  });

  it('순위에 없는 루틴(지워진 루틴)의 인스턴스는 일반 투두처럼 둔다', () => {
    const group = [instance(1, '지워진-루틴', 0), instance(2, 독서.id, 1), instance(3, 운동.id, 2)];

    const changed = applyRoutineRank(group, rank, deps);

    expect(changed.map((todo) => [todo.routineId, todo.order])).toEqual([
      [운동.id, 1],
      [독서.id, 2],
    ]);
  });
});

describe('rankRoutineInstances — 그룹은 서로 독립이다', () => {
  it('두 카테고리·두 날짜의 슬롯이 서로 섞이지 않는다', () => {
    const rank = routineRank([운동, 독서]);
    const 다른카테고리 = '20000000-0000-4000-8000-000000000002';
    const 다음날 = '2026-01-16' as DateKey;
    const todos = [
      instance(1, 독서.id, 0),
      instance(2, 운동.id, 1),
      makeTodo({ seq: 3, routineId: 독서.id, order: 7, categoryId: 다른카테고리, date: DATE }),
      makeTodo({ seq: 4, routineId: 운동.id, order: 9, categoryId: 다른카테고리, date: DATE }),
      makeTodo({ seq: 5, routineId: 독서.id, order: 0, date: 다음날 }),
    ];

    const changed = rankRoutineInstances(todos, rank, deps);

    expect(
      changed.map((todo) => [todo.date, todo.categoryId, todo.routineId, todo.order]).sort(),
    ).toEqual(
      [
        [DATE, todos[0].categoryId, 운동.id, 0],
        [DATE, todos[0].categoryId, 독서.id, 1],
        [DATE, 다른카테고리, 운동.id, 7],
        [DATE, 다른카테고리, 독서.id, 9],
      ].sort(),
    );
    // 다음날 그룹은 인스턴스가 하나라 그대로다.
    expect(changed.some((todo) => todo.date === 다음날)).toBe(false);
  });
});
