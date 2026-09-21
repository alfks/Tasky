// ADR-0017 §재검토 트리거의 세 위험(F1·F2·F3) — T-91 은 F1·F3 을 함수 수준에서만, F2 는 실제 코드가
// 그 전제를 깨고 있음을 `it.fails` 로 드러내기만 했다. T-92(ADR-0018)가 실제 배선을 마쳤으므로 이
// 파일은 이제 **앱 경로가 세 위험을 실제로 닫았음을** 고정한다.
//
// - F1(id 충돌): `routineInstanceSlotId` 를 `planRoutineFill` 이 실제로 쓴다(`routine-fill.ts`).
// - F2(배경 채우기가 사용자 중지를 덮는다): `planRoutineFill` 이 루틴 로우를 전혀 쓰지 않으므로
//   (`RoutineFillPlan` 에 `routine` 필드 자체가 없다) 배경 채우기가 아웃박스에 실릴 것이 없다.
// - F3(워터마크 후퇴): `fillFloor` 는 `routine.rules.ts` 의 `createRoutine`·`resumeRoutine`(둘 다
//   사용자 조작)만 바꾼다 — 채우기가 만드는 값이 없으니 병합에서 "옛 값이 이겨 후퇴"할 대상 자체가
//   없다. `watermark-merge.ts`(함수 수준 단조 병합)는 이제 쓸 곳이 없어 삭제했다.
import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import type { Routine } from '@/domain/routine/routine';
import { planRoutineFill } from '@/domain/routine/routine-fill';
import { routineInstanceSlotId } from '@/domain/routine/slot-id';
import { applyServerRules, type ExistingServerRow } from '@/domain/sync/server-rules';

import { FIXTURE_INSTANT, fixedDeps } from '@/test/fixtures/deps';
import { makeRoutine } from '@/test/fixtures/routine';

describe('F1 — routineInstanceSlotId + applyServerRules 조합이 앱 경로에서 id 충돌을 닫는다', () => {
  it('같은 슬롯을 두 기기가 각자 생성하면, 서버는 먼저 도착한 것만 남기고 둘째는 거절한다', () => {
    const routineId = 'r-shared';
    const date = '2026-02-05' as DateKey;

    // 두 기기가 오프라인에서 독립적으로 같은 (routineId, date) 슬롯을 채운다.
    const idFromDeviceA = routineInstanceSlotId(routineId, date);
    const idFromDeviceB = routineInstanceSlotId(routineId, date);
    expect(idFromDeviceA).toBe(idFromDeviceB); // 결정적 id — 이것이 F1 을 함수 수준에서 닫는 전제

    // 기기 A 가 먼저 도착: 서버는 아직 이 id 를 모른다 → insert.
    const decisionForA = applyServerRules(
      undefined,
      {
        tbl: 'todos',
        id: idFromDeviceA,
        baseSeq: 0, // rev===1, 한 번도 안 고침 → 생성 시도(deriveBaseSeq)
        updatedAt: '2026-02-05T09:00:00.000Z',
      },
      '2026-02-05T09:00:00.000Z',
    );
    expect(decisionForA).toBe('insert');

    // A 가 적용된 뒤 서버 상태.
    const serverAfterA: ExistingServerRow = {
      tbl: 'todos',
      id: idFromDeviceA,
      deleted: false,
      updatedAt: '2026-02-05T09:00:00.000Z',
    };

    // 기기 B 가 같은 id 로 나중에 도착: 이미 있으므로 reject-exists — 로우 1개만 남는다.
    const decisionForB = applyServerRules(
      serverAfterA,
      {
        tbl: 'todos',
        id: idFromDeviceB,
        baseSeq: 0,
        updatedAt: '2026-02-05T09:05:00.000Z',
      },
      '2026-02-05T09:05:00.000Z',
    );
    expect(decisionForB).toBe('reject-exists');
  });

  it('실제 planRoutineFill 로 만든 인스턴스 id 도 같은 (routineId, date) 면 항상 같다', () => {
    const routine: Routine = makeRoutine({ fillFloor: '2026-02-04' as DateKey });
    const deps = fixedDeps();

    const fromDeviceA = planRoutineFill(
      { routine, through: '2026-02-05' as DateKey, existingIds: new Set() },
      deps,
    );
    const fromDeviceB = planRoutineFill(
      { routine, through: '2026-02-05' as DateKey, existingIds: new Set() },
      deps,
    );

    expect(fromDeviceA?.todos.map((t) => t.id)).toEqual(fromDeviceB?.todos.map((t) => t.id));
  });
});

describe('F2 — 배경 채우기는 루틴 로우를 전혀 쓰지 않는다(고쳐짐, T-92)', () => {
  const routine: Routine = makeRoutine({
    fillFloor: '2026-01-15' as DateKey,
    updatedAt: FIXTURE_INSTANT, // 사용자 조작 없음
  });
  // 배경 채우기: 사용자 조작이 전혀 없는데 날짜 범위만 넓어진다(오프라인 방문 등).
  const deps = fixedDeps({ now: '2026-06-01T00:00:00.000Z' }); // 원래 updatedAt 과 다른 시각

  it('채울 것이 있어도 결과에는 투두만 실리고 루틴 로우는 없다 — 아웃박스에 실릴 것 자체가 없다', () => {
    const plan = planRoutineFill(
      { routine, through: '2026-01-22' as DateKey, existingIds: new Set() },
      deps,
    );

    expect(plan).not.toBeNull();
    expect(plan?.todos.length).toBeGreaterThan(0);
    expect(plan).not.toHaveProperty('routine'); // RoutineFillPlan 은 이제 { todos } 뿐이다
    expect(routine.updatedAt).toBe(FIXTURE_INSTANT); // 입력도 그대로 — 애초에 손대지 않는다
  });
});

describe('F3 — 채우기가 루틴 로우를 쓰지 않으므로 워터마크 후퇴 자체가 없다(고쳐짐, T-92)', () => {
  it('여러 번 배경 채우기를 해도 결과 어디에도 루틴 로우가 없다', () => {
    const routine: Routine = makeRoutine({ fillFloor: '2026-01-15' as DateKey });
    const deps = fixedDeps({ now: '2026-06-01T00:00:00.000Z' });

    const first = planRoutineFill(
      { routine, through: '2026-01-22' as DateKey, existingIds: new Set() },
      deps,
    );
    const idsFromFirst = new Set((first?.todos ?? []).map((t) => t.id));
    const second = planRoutineFill(
      { routine, through: '2026-01-29' as DateKey, existingIds: idsFromFirst },
      deps,
    );

    expect(first).not.toHaveProperty('routine');
    expect(second).not.toHaveProperty('routine');
    // fillFloor 는 오직 createRoutine·resumeRoutine(사용자 조작)으로만 바뀐다(routine.rules.ts) —
    // 채우기 자체가 만드는 값이 없으므로 병합에서 "옛 워터마크가 이겨 후퇴"할 대상 자체가 없다.
  });
});
