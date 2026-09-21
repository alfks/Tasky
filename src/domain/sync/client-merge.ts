// 클라이언트 병합 — 풀로 받은 원격 로우 하나를 로컬에 어떻게 반영할지 (SYNC_DESIGN.md §①-5,
// docs/specs/sync.md R4). **`planMerge`(백업 병합, `src/domain/backup/plan-import.ts`)를 재사용하지
// 않는다** — 백업 병합은 `updatedAt`(기기 시계) 축이고, 정상 상태 동기화는 서버 `seq`(아웃박스 존재
// 여부로 대리) 축이라 비교 기준 자체가 다르다(SYNC_DESIGN.md §①-1). 재사용하는 것은 **판정 축이
// 아니라 "무엇을 다시 쓰는가"** — 로우 검증(`remote-rows.ts`)·`isTombstone` 은 그대로 공유한다.
//
// 표(그대로 고정, §①-5):
//
// | 로컬 상태                              | 규칙                              |
// | 로컬에 없음                            | R 저장                           |
// | 있고 아웃박스에 없음                    | R 저장(덮어씀) — 서버가 진실(R3)  |
// | 있고 아웃박스에 있음, rev === 1        | R 저장, 아웃박스에서 제거          |
// | 있고 아웃박스에 있음, rev > 1          | 로컬 유지(R 버림) — 이어지는 푸시가 나중 도착으로 서버에서 이긴다 |
//
// 셋째 행이 ADR-0017 §재검토 위험 1(두 기기 독립 채우기 → id 다른 중복)의 **클라이언트 쪽 마무리**다:
// 슬롯 id 충돌로 이 기기의 생성이 거절당했을 때(`server-rules.ts` reject-exists), 이 기기가 만든
// 사본은 "한 번도 안 고친"(rev===1) 상태이므로 잃을 것이 없다 — 서버가 고른 사본을 그대로 받아들이고
// 자기 것은 버린다.
import type { Meta } from '@/domain/meta';

export type ClientMergeAction =
  | { action: 'adopt-remote' }
  | { action: 'adopt-remote-and-drop-outbox' }
  | { action: 'keep-local' };

export type ClientMergeInput = {
  /** 이 (tbl,id) 의 로컬 로우. 없으면(첫 수신) `local` 은 `undefined`. */
  local: Meta | undefined;
  /** 이 (tbl,id) 가 지금 아웃박스에 있는가(아직 서버에 못 보낸 로컬 변경이 있는가). */
  inOutbox: boolean;
};

/** ①-5 표를 그대로 코드로 옮긴 것. 순수 함수 — 저장은 호출부(`SyncRepository.applyRemote`, T-92)의 몫. */
export function planClientMerge(input: ClientMergeInput): ClientMergeAction {
  if (input.local === undefined || !input.inOutbox) {
    return { action: 'adopt-remote' };
  }
  return input.local.rev <= 1
    ? { action: 'adopt-remote-and-drop-outbox' }
    : { action: 'keep-local' };
}
