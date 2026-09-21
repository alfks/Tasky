// ADR-0017 §재검토 트리거의 세 위험(F1·F2·F3)을 이 티켓이 만든 순수 함수들의 **조합**으로 재현하고
// 닫는다. 실제 `Routine`/`planRoutineFill` 을 쓰지 않는 이유는 owns 제약(`src/domain/routine/**`
// 은 이 티켓 밖) 때문이다 — 그래서 각 시나리오를 "루틴 행의 최소 모양"만 가진 지역 타입으로
// 재현한다. 이 파일은 **소스가 아니라 테스트**이므로(`src/domain/sync/*.test.ts` 는 owns 안) 새
// 소스 파일을 늘리지 않는다.
import { describe, expect, it } from 'vitest';

import { routineInstanceSlotId } from '@/domain/sync/routine-slot';
import { applyServerRules, type ExistingServerRow } from '@/domain/sync/server-rules';
import { mergeRoutineWatermark } from '@/domain/sync/watermark-merge';

describe('F1 — 두 기기 독립 채우기가 id 충돌로 중복 없이 닫힌다', () => {
  it('같은 슬롯을 두 기기가 각자 생성하면, 서버는 먼저 도착한 것만 남기고 둘째는 거절한다', () => {
    const routineId = 'r-shared';
    const date = '2026-02-05';

    // 두 기기가 오프라인에서 독립적으로 같은 (routineId, date) 슬롯을 채운다.
    const idFromDeviceA = routineInstanceSlotId(routineId, date);
    const idFromDeviceB = routineInstanceSlotId(routineId, date);
    expect(idFromDeviceA).toBe(idFromDeviceB); // 결정적 id — 이것이 F1 을 닫는 전제

    // 기기 A 가 먼저 도착: 서버는 아직 이 id 를 모른다 → insert.
    const decisionForA = applyServerRules(undefined, {
      tbl: 'todos',
      id: idFromDeviceA,
      baseSeq: 0, // rev===1, 한 번도 안 고침 → 생성 시도(deriveBaseSeq)
    });
    expect(decisionForA).toBe('insert');

    // A 가 적용된 뒤 서버 상태.
    const serverAfterA: ExistingServerRow = { tbl: 'todos', id: idFromDeviceA, deleted: false };

    // 기기 B 가 같은 id 로 나중에 도착: 이미 있으므로 reject-exists — 로우 1개만 남는다.
    const decisionForB = applyServerRules(serverAfterA, {
      tbl: 'todos',
      id: idFromDeviceB,
      baseSeq: 0,
    });
    expect(decisionForB).toBe('reject-exists');
  });
});

/** F2·F3 재현용 "루틴 행의 최소 모양" — 실제 `Routine` 이 아니다(owns 밖). */
type MinimalRoutineRow = {
  updatedAt: string;
  active: boolean;
  watermark: string;
};

describe('F2 — 배경 채우기가 사용자의 중지를 덮지 않는다(watermark 를 touch 하지 않을 때)', () => {
  it('배경 채우기가 행을 갱신하지 않으면, 사용자의 중지만 유일한 변경으로 남아 이긴다', () => {
    // 두 기기가 같은 루틴 행을 공유한 상태에서 시작.
    const before: MinimalRoutineRow = {
      updatedAt: '2026-02-01T00:00:00.000Z',
      active: true,
      watermark: '2026-01-31',
    };

    // 기기 A: 사용자가 중지 — 이것은 "사용자 조작"이라 행을 touch 한다(updatedAt 이 올라간다).
    const afterPauseOnA: MinimalRoutineRow = {
      ...before,
      active: false,
      updatedAt: '2026-02-01T10:00:00.000Z',
    };

    // 기기 B: 오프라인 배경 채우기가 워터마크만 전진시킨다. **채택한 정책(후보 3)대로 이 채우기는
    // 루틴 행을 touch 하지 않는다** — 그래서 행 자체(updatedAt·active)는 그대로다. 워터마크만 이
    // 시나리오 밖에서 별도로 합쳐진다(mergeRoutineWatermark, 아래 별개 검증).
    const afterBackgroundFillOnB: MinimalRoutineRow = before; // 행이 안 바뀐다 — 이것이 정책의 핵심

    // 두 기기가 동기화될 때 행 자체에 대해 벌어지는 유일한 경합은 "A 의 중지 vs B 의 안 바뀐 원본"
    // 이다. LWW(ADR-0005: updatedAt 큰 쪽) 로 병합하면 A 가 유일한 변경이므로 그대로 이긴다.
    const winner =
      afterPauseOnA.updatedAt > afterBackgroundFillOnB.updatedAt
        ? afterPauseOnA
        : afterBackgroundFillOnB;

    expect(winner.active).toBe(false); // 중지가 살아남는다 — 배경 작업에 덮이지 않는다
  });
});

describe('F3 — 워터마크는 행 LWW 와 별도로 max 로만 합쳐져 후퇴하지 않는다', () => {
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
    // 워터마크가 2/10 → 1/22 로 **후퇴한다**. 이것이 위험 3 이 실제로 일어나는 경로다.
    const naiveWholeRowLww =
      deviceBEditedTitleOnly.updatedAt > deviceAAdvanced.updatedAt
        ? deviceBEditedTitleOnly
        : deviceAAdvanced;
    expect(naiveWholeRowLww.watermark).toBe('2026-01-22'); // 후퇴 — 이래서 후보 2 를 채택했다

    // (채택한 정책) 워터마크는 행 LWW 밖에서 max 로만 합친다 — 어느 쪽이 "더 늦게 고쳤는지"와
    // 무관하게 절대 후퇴하지 않는다.
    const mergedWatermark = mergeRoutineWatermark(
      deviceAAdvanced.watermark,
      deviceBEditedTitleOnly.watermark,
    );
    expect(mergedWatermark).toBe('2026-02-10');
  });
});
