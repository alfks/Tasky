// ADR-0017 §재검토 트리거의 세 위험(F1·F2·F3) — T-91 은 F1·F3 을 함수 수준에서만, F2 는 실제 코드가
// 그 전제를 깨고 있음을 `it.fails` 로 드러내기만 했다. T-92(ADR-0018)가 실제 배선을 마쳤으므로 이
// 파일은 이제 **앱 경로가 F1 을 실제로 닫았음을** 고정한다.
//
// - F1(id 충돌): `routineInstanceSlotId` 를 `planRoutineFill` 이 실제로 쓴다(`routine-fill.ts`) —
//   여전히 닫혀 있다.
// - F2(배경 채우기가 사용자 중지를 덮는다) — **2026-09-21 정정의 정정(T-92b)**: PR #121 은
//   `SyncRepository.existingIds`(당시 T-92b owns 밖)가 없어 `fillFloor` 전진을 임시로 되살렸었다.
//   T-92b 가 그 포트를 배선했으므로 최종 설계(ADR-0018 §결정 3)로 되돌렸다 — `planRoutineFill`
//   (`RoutineFillPlan`)은 이제 루틴 로우를 아예 돌려주지 않는다. 배경 채우기가 루틴 로우를 전혀
//   안 쓰니 아웃박스에 실릴 것도 없고, 그래서 다른 기기의 "중지" 를 덮는 경로 자체가 성립하지 않는다
//   (아래 테스트가 그걸 직접 본다 — 두 기기·실제 동기화 왕복으로 증명하는 스위트는
//   `todo-routine-fill.test.ts`). 이 재검토 트리거는 이제 해소됐다.
// - F3(워터마크 후퇴): 이제 슬롯 id(F1)가 중복 방지의 유일한 근거라, `fillFloor` 가 병합에서
//   후퇴해도(두 기기가 갈렸다가 옛 값이 이겨도) 같은 슬롯은 같은 id 를 만들어 서버가 중복을 거절한다
//   — F3 의 원래 실패 모드("워터마크 후퇴 → 제목 대조가 달라져 중복 생성")는 제목 대조를 그만둔
//   시점에 이미 닫혔다(fillFloor 가 다시 움직이는 것과 무관).
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

describe('F2 — 배경 채우기가 루틴 로우를 쓰지 않는다(ADR-0018 §결정 3, T-92b 로 최종 설계 복귀)', () => {
  const routine: Routine = makeRoutine({
    fillFloor: '2026-01-15' as DateKey,
    updatedAt: FIXTURE_INSTANT, // 사용자 조작 없음
  });
  // 배경 채우기: 사용자 조작이 전혀 없는데 날짜 범위만 넓어진다(오프라인 방문 등).
  const deps = fixedDeps({ now: '2026-06-01T00:00:00.000Z' }); // 원래 updatedAt 과 다른 시각

  it('채울 것이 있어도 결과는 todos 뿐이다 — 루틴 로우가 없으니 touch 될 것도, 아웃박스에 실릴 것도 없다', () => {
    const plan = planRoutineFill(
      { routine, through: '2026-01-22' as DateKey, existingIds: new Set() },
      deps,
    );

    expect(plan).not.toBeNull();
    expect(plan?.todos.length).toBeGreaterThan(0);
    // `RoutineFillPlan` 에는 이제 `routine` 필드 자체가 없다(타입 수준에서 F2 를 막는다) — 누가
    // 실수로 루틴 로우를 다시 실어 보내려 해도 `plan.routine` 은 컴파일이 안 된다.
    expect(plan).not.toHaveProperty('routine');
  });
});

describe('F3 — 슬롯 id(F1)가 dedup 을 넘겨받아 워터마크 후퇴가 더 이상 중복을 만들지 않는다', () => {
  it('워터마크가 뒤로 물러나도(병합 후퇴를 흉내낸 값) 같은 슬롯 id 는 여전히 existingIds 로 걸러진다', () => {
    const routine: Routine = makeRoutine({ fillFloor: '2026-01-15' as DateKey });
    const deps = fixedDeps({ now: '2026-06-01T00:00:00.000Z' });

    const first = planRoutineFill(
      { routine, through: '2026-01-29' as DateKey, existingIds: new Set() },
      deps,
    );
    const idsFromFirst = new Set((first?.todos ?? []).map((t) => t.id));

    // 워터마크가 병합으로 1/15 로 후퇴했다고 흉내낸다(F3 의 원래 시나리오) — 예전(제목 대조) 판정
    // 이었다면 여기서 1/22·1/29 가 중복 생성됐다. 지금은 existingIds(슬롯 id) 가 여전히 그 둘을
    // 알고 있으므로 걸러진다.
    const regressed: Routine = { ...routine, fillFloor: '2026-01-15' as DateKey };
    const second = planRoutineFill(
      { routine: regressed, through: '2026-01-29' as DateKey, existingIds: idsFromFirst },
      deps,
    );

    expect(second?.todos).toEqual([]); // 중복 0건 — F1 의 슬롯 id dedup 이 F3 시나리오도 막는다
  });
});
