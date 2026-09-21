// 로컬 쓰기 신호(ADR-0018) — 저장소가 로컬 엔티티를 실제로 쓴 직후 부르는 얇은 pub/sub. 동기화
// 엔진(T-94, `features/sync/store/sync-engine.ts`)이 이 신호를 1.5초 디바운스로 모아 동기화
// 사이클을 켠다(§B-4 "동기화 엔진의 1.5s 코얼레싱 근거"). 호출부는 `infra/indexeddb/query.ts`
// 의 `put`/`bulkPut`과 `repositories/memory/live.ts`의 `put`/`replaceRows` 뿐이다.
//
// feature 어휘를 모르는 순수 유틸(`lib/AGENTS.md` 조건 1·2) — 저장소가 "무엇을" 썼는지는 신호에
// 싣지 않는다(엔진은 다음 사이클에 아웃박스 전체를 다시 읽으므로 필요 없다).

export type Unsubscribe = () => void;

const listeners = new Set<() => void>();

/** 로컬 쓰기(개체 upsert·복원) 직후 호출한다. 동기 — 구독자에게 즉시 알린다. */
export function notifyLocalWrite(): void {
  for (const listener of listeners) {
    listener();
  }
}

/** 로컬 쓰기 신호를 구독한다. 반환값을 부르면 구독을 해제한다. */
export function onLocalWrite(listener: () => void): Unsubscribe {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
