// 서버 판정 규칙 — 두 줄 (SYNC_DESIGN.md §②-2·§0 결론 5, docs/specs/sync.md R4).
//
// **갱신은 나중 도착이 이긴다. 생성은 없을 때만 들어간다.** 이 함수는 **Worker 와 메모리 가짜
// 서버가 같이 돈다** — "가짜가 항상 성공하는 종류의 거짓 초록불"을 구조로 막는 자리다
// (SYNC_DESIGN.md §0 결론 9). 그래서 순수 함수여야 하고(부수효과 0, `Date`·난수 없음) `domain/sync/`
// 밖으로 나가지 않는다. seq 발급·D1 SQL·인메모리 저장은 각각 Worker(T-93)·메모리 트랜스포트(T-92)의
// 몫이고, 이 함수는 그 둘이 "무엇을 할지"만 정한다.
//
// **`existing` 의 유무는 툼스톤을 가리지 않는다** — 서버 `entities` 로우는 삭제돼도 물리적으로
// 남는다(소프트 삭제, ①-3). 그래서 "생성 시도인데 이미 (살아있든 죽었든) 로우가 있다" 는 항상
// `reject-exists` 다: 이것이 슬롯 id 충돌(F1, ADR-0017 §재검토 위험 1)을 서버 쪽에서 막는 지점이다
// — 두 기기가 같은 `(routineId, date)` 슬롯 id 로 독립 생성해도, 먼저 도착한 것만 남는다.
//
// **"툼스톤은 최종" 규칙을 두지 않는다** — 갱신(baseSeq>0)은 `existing` 이 툼스톤이어도 항상
// 적용된다. 그래야 되돌리기(살아있는 로우를 같은 id 로 다시 put)가 "나중 도착이 이긴다"로 자연히
// 전파된다(SYNC_DESIGN.md §①-3).
import type { SyncTable } from '@/domain/sync/wire';

/** 서버(또는 가짜 서버)가 이미 갖고 있는 로우의 존재만 알면 된다 — 내용은 판정에 쓰지 않는다. */
export type ExistingServerRow = {
  tbl: SyncTable;
  id: string;
  /** 소프트 삭제 여부. 판정에는 영향 없다(아래 jsdoc) — 호출부 로깅·GC 참고용으로만 들고 있다. */
  deleted: boolean;
};

export type ServerChange = {
  tbl: SyncTable;
  id: string;
  /** `wire.ts#SyncChange.baseSeq` 그대로 — 0 이면 생성 시도, 0 초과면 갱신 시도. */
  baseSeq: number;
};

/**
 * `insert`: 로우가 서버에 처음 생긴다(그 뒤 seq 발급·INSERT 는 호출부).
 * `update`: 이미 있는 로우를 무조건 덮어쓴다(나중 도착이 이긴다).
 * `reject-exists`: 생성 시도(`baseSeq === 0`)인데 이미 로우가 있다 — 이 변경만 거절하고 나머지는
 * 계속 처리한다(`rejected: 'exists'`, docs/specs/sync.md R4 는 이 경우도 "사용자에게 병합 화면을
 * 보여주지 않는다"에 포함된다 — 클라이언트는 조용히 서버 로우를 받아들인다, `client-merge.ts`).
 */
export type ServerRuleResult = 'insert' | 'update' | 'reject-exists';

export function applyServerRules(
  existing: ExistingServerRow | undefined,
  change: ServerChange,
): ServerRuleResult {
  const isCreateAttempt = change.baseSeq === 0;
  if (existing === undefined) {
    return 'insert';
  }
  return isCreateAttempt ? 'reject-exists' : 'update';
}
