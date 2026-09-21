// 아웃박스(`syncOutbox`) 도메인 — 무엇이 들어가고 언제 비워지는가 중 **순수 함수로 표현 가능한
// 부분만** (실제 적재·저장은 `SyncRepository`, T-92). docs/specs/sync.md §4 "syncOutbox: 서버에
// 아직 못 보낸 로컬 변경의 큐. (tbl,id) 유일".
import type { SyncTable } from '@/domain/sync/wire';

/** 아웃박스 한 줄. `rev` 는 이 변경을 큐에 넣은 시점의 로컬 `Meta.rev` — 그 이상은 필요 없다(아래). */
export type OutboxEntry = { tbl: SyncTable; id: string; rev: number };

/**
 * 로컬 `rev` 로 `wire.ts#SyncChange.baseSeq` 를 만든다. **새 필드를 안 둔다**(SYNC_DESIGN.md §0
 * 결론 2 "Meta.rev 는 손대지 않고 서버 순번은 별도로") 는 원칙을 지키면서 "서버가 이 로우를
 * 이미 아는지"를 판정하는 방법은, 서버 SQL(§②-2)이 실제로 `baseSeq` 의 **영(0) 여부만** 보고 값
 * 자체는 저장·비교하지 않는다는 사실에서 나온다:
 *
 * - `rev <= 1`(생성 후 한 번도 안 고침) → **이 기기가 이 id 를 서버에 보낸 적이 없다고 볼 근거가
 *   가장 강하다** → `baseSeq = 0`(생성 시도). 다른 기기가 같은 id(슬롯 id 충돌, ADR-0017 §재검토
 *   위험 1)를 먼저 올렸으면 서버가 `reject-exists` 로 돌려주고, 이 기기는 아무것도 잃지 않는다
 *   (`client-merge.ts` rev===1 행이 그 뒤처리를 맡는다).
 * - `rev > 1`(한 번이라도 고침) → `baseSeq = rev`(0 이 아니기만 하면 된다 — 정확한 값은 서버가
 *   비교하지 않는다, `wire.ts#SyncChange` jsdoc). 서버에 아직 없는 진짜 새 로우라도 안전하다 —
 *   `applyServerRules` 의 "갱신-없음" 벡터가 보여주듯 `existing` 이 없으면 그냥 insert 로 끝난다.
 *
 * **판단이 필요했던 지점(스펙이 값을 안 줬다)**: 설계 문서는 `SyncRequest.changes[].baseSeq` 를
 * "마지막으로 받은 seq" 라고만 적었을 뿐, 클라이언트가 로우별 seq 를 **어디에 저장해 두는지는
 * 말하지 않는다**(§4 는 오히려 "로우 밖, 커서 하나"라고 못박는다) — 저장할 곳이 없다는 뜻으로
 * 읽었다. `rev` 를 대리 신호로 쓰면 별도 상태 없이 §②-2 SQL 의 요구(영/비영만 구분)를 정확히
 * 만족하고, `client-merge.ts` 가 이미 같은 `rev===1` 신호를 판정 축으로 쓰고 있어 일관적이다.
 */
export function deriveBaseSeq(rev: number): number {
  return rev <= 1 ? 0 : rev;
}

/** `OutboxEntry` + 로우 본문 → 전송용 `SyncChange`(순수 조립, 네트워크 없음). */
export function toSyncChange(
  entry: OutboxEntry,
  row: unknown,
): { tbl: SyncTable; id: string; baseSeq: number; row: unknown } {
  return { tbl: entry.tbl, id: entry.id, baseSeq: deriveBaseSeq(entry.rev), row };
}

/**
 * ack 후 이 항목을 아웃박스에서 지워도 되는가 — "ack 가 새 변경을 지운다" 회귀 방지(T-92 완료 조건).
 * 큐에 있는 항목의 `rev` 와 **방금 푸시에 실은** `rev` 가 같을 때만 지운다. 그 사이(요청을 보낸
 * 뒤 응답이 오기 전) 사용자가 같은 로우를 다시 고쳐 `rev` 가 올라갔다면, 그 변경은 아직 전송되지
 * 않았으므로 `keep`.
 */
export function reconcileAck(
  queued: OutboxEntry,
  pushed: { tbl: SyncTable; id: string; rev: number },
): 'remove' | 'keep' {
  if (queued.tbl !== pushed.tbl || queued.id !== pushed.id) {
    return 'keep';
  }
  return queued.rev === pushed.rev ? 'remove' : 'keep';
}

/** 아웃박스 앞에서부터 `limit` 건 — 요청 상한(≤500, SYNC_DESIGN.md §②-3)을 자르는 순수 조각. */
export function takeOutboxBatch(entries: readonly OutboxEntry[], limit: number): OutboxEntry[] {
  return entries.slice(0, Math.max(0, limit));
}

/**
 * 격리 판정(③-4) — 같은 (tbl,id) 가 `invalid` 로 **연속 3회** 거절되면 더는 재시도하지 않고
 * 격리한다("없으면 영원히 재시도해 조용한 무한 루프가 된다"). 카운트는 호출부(`syncState`,
 * T-92)가 들고 있다 — 여기서는 "몇 번째부터 격리인가"만 고정한다.
 */
export const QUARANTINE_AFTER_CONSECUTIVE_INVALID = 3;

export function shouldQuarantine(consecutiveInvalidRejections: number): boolean {
  return consecutiveInvalidRejections >= QUARANTINE_AFTER_CONSECUTIVE_INVALID;
}
