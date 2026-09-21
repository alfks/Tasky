// 서버 판정 규칙 (ADR-0005 §충돌 정책, ADR-0015 §2 정정(2026-09-21), docs/specs/sync.md R4).
//
// **갱신은 `updatedAt` 큰 쪽이 이긴다. 동률이면 서버 도착 순(지금 도착한 change 가 이긴다). 서버는
// 미래 시각을 수신 시각으로 클램프한다. 생성은 없을 때만 들어간다.** 이 함수는 **Worker 와 메모리
// 가짜 서버가 같이 돈다** — "가짜가 항상 성공하는 종류의 거짓 초록불"을 구조로 막는 자리다
// (SYNC_DESIGN.md §0 결론 9). 그래서 순수 함수여야 하고(부수효과 0, `Date`·난수 없음) `domain/sync/`
// 밖으로 나가지 않는다. seq 발급·D1 SQL·인메모리 저장은 각각 Worker(T-93)·메모리 트랜스포트(T-92)의
// 몫이고, 이 함수는 그 둘이 "무엇을 할지"만 정한다.
//
// **역사**: 이전 판(2026-09-20 이전)은 "갱신은 나중 도착이 이긴다"(seq 도착 순 단독)였다. 그런데
// ADR-0015 §2 의 2026-09-21 정정이 이를 명시적으로 되돌렸다 — 오프라인으로 사흘 뒤 올라온 옛 편집이
// 그사이 다른 기기가 만든 최신 편집을 덮는 반사실이 실측됐기 때문이다(A 10:00 편집→10:01 푸시, B
// 09:00 오프라인 편집→10:05 푸시 하면 도착 순 단독 규칙에서는 B 가 이겨 A 의 편집이 소실된다).
// ADR-0005·docs/specs/sync.md R4 는 원래부터 `updatedAt` LWW 였다 — 이 파일이 그 단일 정책으로
// 되돌아온 것이다.
//
// **`existing` 의 유무는 툼스톤을 가리지 않는다** — 서버 `entities` 로우는 삭제돼도 물리적으로
// 남는다(소프트 삭제, ①-3). 그래서 "생성 시도인데 이미 (살아있든 죽었든) 로우가 있다" 는 항상
// `reject-exists` 다: 이것이 슬롯 id 충돌(F1, ADR-0017 §재검토 위험 1)을 서버 쪽에서 막는 지점이다
// — 두 기기가 같은 `(routineId, date)` 슬롯 id 로 독립 생성해도, 먼저 도착한 것만 남는다.
//
// **"툼스톤은 최종" 규칙을 두지 않는다** — 갱신(baseSeq>0)은 `existing` 이 툼스톤이어도 `updatedAt`
// LWW 판정을 거쳐 적용될 수 있다. 그래야 되돌리기(살아있는 로우를 같은 id 로 다시 put)가 LWW 로
// 자연히 전파된다(SYNC_DESIGN.md §①-3) — 다만 이제는 "무조건"이 아니라 "이겨야" 전파된다.
import type { SyncTable } from '@/domain/sync/wire';

/** 서버(또는 가짜 서버)가 이미 갖고 있는 로우의 판정용 요약. 내용(필드값)은 판정에 쓰지 않는다. */
export type ExistingServerRow = {
  tbl: SyncTable;
  id: string;
  /** 소프트 삭제 여부. LWW 판정에는 영향 없다(위 jsdoc) — 호출부 로깅·GC 참고용으로만 들고 있다. */
  deleted: boolean;
  /**
   * 이 로우가 서버에 마지막으로 적용됐을 때의 `updatedAt` — **이미 클램프 적용된 값**이어야 한다
   * (`clampFutureUpdatedAt` 을 그 시점에 거쳤다고 가정한다). 이 파일은 다시 클램프하지 않는다.
   */
  updatedAt: string;
};

export type ServerChange = {
  tbl: SyncTable;
  id: string;
  /** `wire.ts#SyncChange.baseSeq` 그대로 — 0 이면 생성 시도, 0 초과면 갱신 시도. */
  baseSeq: number;
  /**
   * 클라이언트가 실어 보낸 `Meta.updatedAt`. 호출부가 `clampFutureUpdatedAt(raw, receivedAt)` 을
   * 거친 뒤의 값을 넣어야 한다 — 이 함수 자체는 클램프하지 않는다(수신 시각을 모른다, 순수성).
   */
  updatedAt: string;
};

/**
 * `insert`: 로우가 서버에 처음 생긴다(그 뒤 seq 발급·INSERT 는 호출부).
 * `update`: 갱신 시도가 LWW 를 이겨 로우를 덮어쓴다(`change.updatedAt >= existing.updatedAt`).
 * `reject-stale`: 갱신 시도가 LWW 를 져서 적용되지 않는다(`change.updatedAt < existing.updatedAt`)
 * — 오류가 아니라 정상적인 수렴 경로다: 이 change 는 seq 를 받지 못하고, 클라이언트는 다음 풀에서
 * 이긴 쪽(`existing`)을 받아 자연히 수렴한다(docs/specs/sync.md R4 "병합 화면을 보여주지 않는다").
 * `reject-exists`: 생성 시도(`baseSeq === 0`)인데 이미 로우가 있다 — 이 변경만 거절하고 나머지는
 * 계속 처리한다(`rejected: 'exists'`, 클라이언트는 조용히 서버 로우를 받아들인다, `client-merge.ts`).
 * `reject-invalid`: `baseSeq` 가 정수·비음수가 아니다(문자열·NaN·음수·소수·null 등) — "생성은 없을
 * 때만"(`isCreateAttempt = baseSeq === 0`) 가드는 `baseSeq` 가 정확히 숫자 `0` 일 때만 성립하므로,
 * 형식이 어긋나면 그 가드 자체가 무의미해진다. 값을 신뢰하지 않고 이 자리에서 바로 거절한다.
 */
export type ServerRuleResult = 'insert' | 'update' | 'reject-exists' | 'reject-stale' | 'reject-invalid';

/**
 * 미래 시각 클램프 — `updatedAt` 이 서버 수신 시각보다 미래면 수신 시각으로 내려 앉힌다(ADR-0005
 * §충돌 정책 "서버는 미래 시각을 수신 시각으로 클램프"). 순수 함수 — `Date` 를 직접 부르지 않고
 * 수신 시각을 인자로 받는다(ADR-0005 규칙 2). 호출부(Worker, T-93)가 실제 수신 시각을 넣어 이
 * 함수를 거친 뒤에야 `ServerChange.updatedAt`/`ExistingServerRow.updatedAt` 을 만들어야 한다 —
 * `applyServerRules` 는 이미 클램프됐다고 가정하고 다시 클램프하지 않는다.
 *
 * ISO 8601 UTC 문자열(`toISOString()` 형식, ADR-0005)은 사전순 비교가 시간순 비교와 같다.
 *
 * **호출 자리(SYNC_DESIGN.md §②-2, 아직 구현 없음)**: 요청 로우 검증 뒤·upsert 전, `worker/sync/
 * handler.ts`(T-93)가 `Date.now()`(Worker 의 수신 시각)를 `receivedAt` 으로 넣어 이 함수를 부른다 —
 * `Date` 호출은 그 경계 파일에만 있고, 이 함수 자체는 여전히 순수하다.
 */
export function clampFutureUpdatedAt(updatedAt: string, receivedAt: string): string {
  return updatedAt > receivedAt ? receivedAt : updatedAt;
}

function isValidBaseSeq(baseSeq: number): boolean {
  return typeof baseSeq === 'number' && Number.isInteger(baseSeq) && baseSeq >= 0;
}

export function applyServerRules(
  existing: ExistingServerRow | undefined,
  change: ServerChange,
): ServerRuleResult {
  if (
    existing !== undefined &&
    (existing.tbl !== change.tbl || existing.id !== change.id)
  ) {
    throw new Error(
      `applyServerRules: existing (${existing.tbl},${existing.id}) 와 change (${change.tbl},${change.id}) 가 다른 로우를 가리킨다`,
    );
  }

  if (!isValidBaseSeq(change.baseSeq)) {
    return 'reject-invalid';
  }

  const isCreateAttempt = change.baseSeq === 0;
  if (existing === undefined) {
    return 'insert';
  }
  if (isCreateAttempt) {
    return 'reject-exists';
  }
  // 갱신 시도: updatedAt LWW. 동률이면 지금 도착한 change 가 이긴다(서버 도착 순).
  return change.updatedAt >= existing.updatedAt ? 'update' : 'reject-stale';
}
