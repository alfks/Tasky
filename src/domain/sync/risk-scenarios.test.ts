// ADR-0017 §재검토 트리거의 세 위험(F1·F2·F3) 중 이 파일이 실제로 **시험**하는 것은 F1·F3 뿐이다 —
// 그리고 그 둘도 **함수 수준**의 시험이다: `routineInstanceSlotId`·`mergeRoutineWatermark`·
// `applyServerRules` 를 조합하면 그 함수들만 놓고 볼 때 위험이 닫힌다는 뜻이지, 앱의 실제 채우기
// 경로(`routine-fill.ts`)가 이 함수들을 쓰고 있다는 뜻이 **아니다**. 실측 결과 오늘 시점 앱은 둘 다
// 열려 있다:
//
// - F1(id 충돌): `routineInstanceSlotId` 는 `src/domain/routine/` 에서 참조 0건이다. 실제 채우기
//   (`routine-fill.ts` → `createTodo` → `createMeta`)는 여전히 `deps.id()` 난수를 쓴다 — 같은 루틴
//   슬롯을 두 기기가 독립적으로 채우면 앱에서는 여전히 다른 id 두 개가 생긴다.
// - F3(워터마크 후퇴): `mergeRoutineWatermark` 도 `Routine` 병합 경로에 배선돼 있지 않다.
//   `materializedThrough` 는 여전히 행 전체 LWW 를 타므로, 제목만 고친 기기의 옛 워터마크가 앱에서
//   실제로 후퇴를 일으킬 수 있다.
//
// 배선(각각 `src/domain/routine/**`)은 이 티켓 owns 밖이라 T-92 가 맡는다. F2 는 시험이 아니라
// **드러내기**다 — "배경 채우기가 행을 touch 하지 않는다"는 F2 의 전제 자체가 실제 코드와 정반대다
// (`routine-fill.ts` 의 `planRoutineFill` 이 `touch({...routine, materializedThrough: to},
// deps.now())` 로 채우기 행을 무조건 touch 한다, 사용자 조작 여부와 무관). 아래 `it.fails` 가 그
// 사실을 실측으로 고정한다 — 후속 티켓(T-92)이 실제로 고치면 이 테스트가 자동으로 깨져 알려준다.
//
// F1·F3 재현에 실제 `Routine`/`planRoutineFill` 을 쓰지 않는 이유는 여전히 같다: owns 제약
// (`src/domain/routine/**` 은 이 티켓 밖) 때문에 "루틴 행의 최소 모양"만 가진 지역 타입으로
// 재현한다. F2 만 예외로 실제 `planRoutineFill` 을 **읽기만 해서 호출**한다(수정은 하지 않는다,
// owns 준수). 이 파일은 **소스가 아니라 테스트**이므로(`src/domain/sync/*.test.ts` 는 owns 안) 새
// 소스 파일을 늘리지 않는다.
import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';
import type { Routine } from '@/domain/routine/routine';
import { planRoutineFill } from '@/domain/routine/routine-fill';
import { routineInstanceSlotId } from '@/domain/sync/routine-slot';
import { applyServerRules, type ExistingServerRow } from '@/domain/sync/server-rules';
import { mergeRoutineWatermark } from '@/domain/sync/watermark-merge';

import { FIXTURE_INSTANT, fixedDeps } from '@/test/fixtures/deps';
import { makeRoutine } from '@/test/fixtures/routine';

describe('F1 — routineInstanceSlotId + applyServerRules 조합은 함수 수준에서 id 충돌을 닫는다(앱 경로 배선은 아직 없다, T-92)', () => {
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
});

describe('F2 — 배경 채우기가 사용자의 중지를 덮지 않는다는 전제는 실제 코드와 반대다(드러내기, T-92)', () => {
  // routine-fill.ts 는 read-only 로만 import 한다 — owns(`src/domain/sync/**`) 밖이라 고칠 수 없다.
  const routine: Routine = makeRoutine({
    materializedThrough: '2026-01-15' as DateKey,
    updatedAt: FIXTURE_INSTANT, // 사용자 조작 없음 — 이 값이 유지돼야 F2 전제가 성립한다
  });
  // 배경 채우기: 사용자 조작이 전혀 없는데 워터마크 구간만 전진한다(오프라인 방문 등).
  const deps = fixedDeps({ now: '2026-06-01T00:00:00.000Z' }); // 원래 updatedAt 과 다른 시각

  // 가드: it.fails 밖의 별도 it — "채울 게 있다"는 이 시나리오의 전제가 살아있는지만 단언한다.
  // it.fails 안에 있으면 planRoutineFill 이 null 을 돌려주게 바뀌어도(예: "채울 게 없으면 null")
  // 그 assertion 실패가 그대로 "기대한 실패"로 삼켜져 초록불이 침묵한다 — 그래서 밖으로 뺐다.
  it('가드: 이 시나리오는 실제로 채울 것이 있다(planRoutineFill 이 null 이 아니다)', () => {
    const plan = planRoutineFill({ routine, through: '2026-01-22' as DateKey, existing: [] }, deps);
    expect(plan).not.toBeNull();
  });

  it.fails(
    '기대(F2 의 전제): 채울 것이 있어도 사용자가 아무 것도 고치지 않았다면 updatedAt 은 그대로여야 한다 — 실제는 항상 touch 해서 이 기대가 깨진다(routine-fill.ts:78, T-92)',
    () => {
      const plan = planRoutineFill(
        { routine, through: '2026-01-22' as DateKey, existing: [] },
        deps,
      );
      // F2 가 전제하는 정책(후보 3): 배경 채우기는 행을 touch 하지 않는다.
      expect(plan?.routine.updatedAt).toBe(routine.updatedAt);
    },
  );
});

/** F3 재현용 "루틴 행의 최소 모양" — 실제 `Routine` 이 아니다(owns 밖). */
type MinimalRoutineRow = {
  updatedAt: string;
  active: boolean;
  watermark: string;
};

describe('F3 — mergeRoutineWatermark 는 함수 수준에서 워터마크 후퇴를 막는다(앱 경로 배선은 아직 없다, T-92)', () => {
  it('제목만 고친(따라서 updatedAt 이 더 늦은) 기기의 옛 워터마크가 행 전체 LWW 를 타면 후퇴하지만, watermark-merge 로 따로 합치면 후퇴하지 않는다', () => {
    const deviceAAdvanced: MinimalRoutineRow = {
      updatedAt: '2026-02-01T00:00:00.000Z',
      active: true,
      watermark: '2026-02-10', // A 는 계속 채워 워터마크가 전진했다
    };
    const deviceBEditedTitleOnly: MinimalRoutineRow = {
      updatedAt: '2026-02-05T00:00:00.000Z', // B 는 그 뒤에 제목만 고쳐 updatedAt 이 더 늦다
      active: true,
      watermark: '2026-01-22', // 하지만 B 의 워터마크는 예전 값 그대로다
    };

    // (대조군) 행 전체를 일반 LWW 로 병합하면 — updatedAt 이 더 늦은 B 가 통째로 이겨
    // 워터마크가 2/10 → 1/22 로 **후퇴한다**. 이것이 위험 3 이 앱에서 실제로 일어나는 경로다
    // (오늘 시점 앱의 실제 병합 경로가 바로 이 대조군과 같다 — mergeRoutineWatermark 미배선).
    const naiveWholeRowLww =
      deviceBEditedTitleOnly.updatedAt > deviceAAdvanced.updatedAt
        ? deviceBEditedTitleOnly
        : deviceAAdvanced;
    expect(naiveWholeRowLww.watermark).toBe('2026-01-22'); // 후퇴 — 이래서 후보 2 를 채택했다

    // (채택했지만 아직 배선 안 된 정책) 워터마크를 행 LWW 밖에서 max 로만 합치면, 함수 수준에서는
    // 어느 쪽이 "더 늦게 고쳤는지"와 무관하게 절대 후퇴하지 않는다.
    const mergedWatermark = mergeRoutineWatermark(
      deviceAAdvanced.watermark as DateKey,
      deviceBEditedTitleOnly.watermark as DateKey,
    );
    expect(mergedWatermark).toBe('2026-02-10');
  });
});
