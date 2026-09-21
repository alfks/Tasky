// 루틴 워터마크(`Routine.materializedThrough`)의 동기화 병합 규칙 (SYNC_DESIGN.md §①-2,
// ADR-0017 §재검토 트리거 위험 3 "워터마크 후퇴").
//
// **채택한 후보 2/3: "워터마크를 행 LWW 대상에서 빼 단조 증가(max) 전용 필드로 둔다."** 백업 병합의
// `planMergeRoutines`(`src/domain/backup/plan-import.ts`)가 이미 같은 결정을 내렸다(ADR-0017 §병합
// 정정: "min 은 실제 손상이고 max 에는 대칭되는 손상이 없다") — 여기서는 그 **판정 함수 자체**를
// sync 맥락에서 다시 고정한다. 백업 병합의 `planMergeRoutines` 를 그대로 재사용하지 않는 이유는
// §①-1 과 같다: 그 함수는 `updatedAt` 축의 `planMerge` 결과 위에 얹혀 있어 sync 의 `rev`/아웃박스
// 축과 섞을 수 없다.
//
// **왜 위험한가(위험 3, 재현)**: 행 전체를 일반 LWW(`updatedAt` 큰 쪽 승)로 병합하면, "워터마크는
// 안 바꾸고 제목만 고친" 기기의 `updatedAt` 이 더 최근이라는 이유만으로 그 기기의 **옛 워터마크가
// 통째로 승리**한다 — 이미 지나간 구간이 다시 열려, 그사이 다른 기기가 지운 인스턴스가 부활하고
// (조회 대조는 살아 있는 것만 보므로, `routine-fill.ts` 주석) 옮기거나 제목을 고친 인스턴스가
// 중복 생성된다. 워터마크만 **max 로 따로** 합치면 이 후퇴가 원천적으로 없다.
//
// **이 티켓 owns 밖의 일**: 이 함수를 실제 `Routine` 병합 경로에 끼워 넣는 배선(행 병합에서
// `materializedThrough` 필드만 이 함수로 바꿔치기)은 `src/domain/routine/**`(또는 그 필드를
// `fillFloor` 로 재정의하는 리네임)을 건드려야 해서 owns 밖이다 — `risk-scenarios.test.ts` 가
// "이 함수를 썼다면 후퇴가 없다"를 이 파일 수준에서 고정하고, 실제 배선은 후속 티켓이 맡는다.
export function mergeRoutineWatermark(local: string, remote: string): string {
  return remote > local ? remote : local;
}
