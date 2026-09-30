// 동기화 와이어 프로토콜 타입 (docs/specs/sync.md §4, ADR-0015 §2·§3). **Worker(worker/) 와 공유하는
// 단일 소스** — Worker 는 이 파일을 그대로 import 한다(도메인은 외부 의존 0 이라 Worker 번들에 들어간다,
// SYNC_DESIGN.md §②-1). 값이 아니라 프로토콜의 **모양**만 여기 있다 — 실제 왕복(HTTP·D1)은
// `src/infra/sync/**`·`worker/**`(둘 다 이 티켓 owns 밖).
//
// `SyncTable` 을 `keyof DatasetSnapshot` 에서 파생하는 이유: `@/domain/dataset` 의 7개 테이블이 곧
// 동기화 대상 전부다(§4 "IDB ↔ D1 대응"). 테이블이 늘면 `DatasetSnapshot` 이 먼저 바뀌므로, 여기서
// 다시 나열하지 않고 파생시키면 **빠뜨림이 컴파일 에러**가 된다(수동 나열이면 조용히 누락된다).
import type { DatasetSnapshot } from '@/domain/dataset';

/** 동기화 대상 7테이블. `Meta` 는 전부 `todos`~`routines` 의 공통 필드이므로 값은 여기 없다. */
export type SyncTable = keyof DatasetSnapshot;

/**
 * `SyncTable` 의 런타임 목록 + 멤버십 판정. `Record<SyncTable, true>` 로 적어 컴파일 타임 전수
 * 대조를 강제한다(`validate-rows.ts` 의 `whitelist<T>()` 와 같은 목적 — 여기서는 필드가 아니라
 * **키 전체**가 대조 대상이라 그 헬퍼를 그대로 쓸 수 없어 더 단순한 형태로 다시 만든다). 테이블이
 * 늘거나 줄면 이 리터럴이 `Record<SyncTable, true>` 를 더 이상 만족하지 않아 컴파일 에러가 난다.
 */
const SYNC_TABLE_SET: Record<SyncTable, true> = {
  todos: true,
  categories: true,
  focusSessions: true,
  settings: true,
  ddays: true,
  diaryEntries: true,
  routines: true,
};

/** `SyncTable` 값 전체(런타임 배열). Worker 의 `CHECK (tbl IN (...))` 와 같은 집합이어야 한다. */
export const SYNC_TABLES: readonly SyncTable[] = Object.keys(SYNC_TABLE_SET) as SyncTable[];

/** 임의 문자열이 알려진 테이블인지 — 원격에서 온 `tbl` 값의 첫 관문(`rejected: 'unknown-table'`). */
export function isSyncTable(value: string): value is SyncTable {
  return Object.prototype.hasOwnProperty.call(SYNC_TABLE_SET, value);
}

/**
 * 로컬 변경 한 건(아웃박스 → 요청). `baseSeq` 는 "이 로우가 서버에 이미 있다고 이 기기가 믿는지"를
 * 나타내는 신호다 — `0` 이면 **생성**(서버가 없을 때만 받는다), `0` 초과면 **갱신**(`updatedAt` 이
 * 크면 이긴다, 동률이면 도착 순 — 지면 `rejected: 'stale'`, `server-rules.ts` LWW). SYNC_DESIGN.md
 * §②-2 의 SQL 이 실제로 비교하는 것은 `baseSeq` 의
 * **영(0) 여부뿐**이다(어느 seq 였는지는 저장도 비교도 하지 않는다) — 그래서 클라이언트는 서버가
 * 준 정확한 seq 를 기억할 필요가 없고(스펙 §4 "로우 밖, 커서 하나"), 이미 갖고 있는 `Meta.rev` 로
 * 그 여부만 판단하면 충분하다(`outbox.ts#deriveBaseSeq`).
 */
export type SyncChange = {
  tbl: SyncTable;
  id: string;
  baseSeq: number;
  /** 직렬화된 `Persistable<T>`. 브랜드는 전송 과정에서 자연히 벗겨진다(JSON 에 안 실림). */
  row: unknown;
};

/** 한 왕복의 요청 본문 (protocol v1). */
export type SyncRequest = {
  protocol: 1;
  /** ADR-0026: 프로필 호환성 프로토콜을 지원한다. 행 표식과 함께 명시적 삭제를 판정한다. */
  settingsProfileVersion?: 1;
  /** 업데이트 후 첫 동기화에서 커서 이전·자기 기기의 설정도 받아 프로필을 회복한다. */
  includeOwnSettings?: boolean;
  deviceId: string;
  /** 풀 커서 — 이 seq **이후**부터 받는다. */
  cursor: number;
  /** ≤ 500 (SYNC_DESIGN.md §②-3). 상한 자체는 전송 계층(T-92/93)이 지킨다 — 여기는 타입만. */
  changes: readonly SyncChange[];
};

/**
 * `'stale'`(정정 2026-09-21): 갱신 시도가 `updatedAt` LWW 로 졌다(`server-rules.ts#applyServerRules`
 * 의 `'reject-stale'`) — 형식은 멀쩡하지만 서버가 더 최신 로우를 갖고 있어 적용하지 않았다는 뜻.
 * `'invalid'`(형식 오류, 격리 카운터 대상)와 달리 정상 흐름이다: 클라이언트는 특별 처리 없이 다음
 * 풀에서 이긴 값을 받아 정착한다(사용자에게 보이지 않는다, docs/specs/sync.md R4).
 */
export type SyncRejectReason = 'exists' | 'invalid' | 'unknown-table' | 'stale';

export type SyncApplied = { tbl: SyncTable; id: string; seq: number };
export type SyncRejected = { tbl: SyncTable; id: string; reason: SyncRejectReason };
/** 풀로 받은 원격 로우 한 건. `row` 는 아직 검증 전 — `remote-rows.ts` 를 거쳐야 한다. */
export type PulledRow = { tbl: SyncTable; id: string; seq: number; row: unknown };

/** `cursor` 가 서버 GC 플로어보다 뒤처져 델타를 못 줄 때 — 전량 재수신(`restore`) 필요. */
export type SyncResyncResponse = { resync: true; gcFloor: number };

export type SyncOkResponse = {
  /** 이 응답까지 받은 seq(풀 결과의 max, 없으면 요청 그대로). 다음 요청의 `cursor` 로 쓴다. */
  cursor: number;
  applied: readonly SyncApplied[];
  rejected: readonly SyncRejected[];
  /** 자기 기기 제외, seq 오름차순, ≤ 500. */
  pulled: readonly PulledRow[];
  /** 500 건으로 잘렸으면 true — 즉시 다음 왕복(SYNC_DESIGN.md §③-3). */
  more: boolean;
  gcFloor: number;
};

export type SyncResponse = SyncResyncResponse | SyncOkResponse;

/** 응답이 재수신 지시인지 — 호출부의 분기점 하나. */
export function isResyncResponse(response: SyncResponse): response is SyncResyncResponse {
  return 'resync' in response && response.resync === true;
}

/**
 * 로그인한 기기의 로컬 동기화 표식 (docs/specs/sync.md §4 "새 로컬 개념 넷" 중 `syncState`).
 * 값 타입만 여기 있다 — 저장 계약(`SyncRepository.getState`/`setState`)은 `src/repositories/**`
 * (T-92 owns), IndexedDB 테이블(`syncState`)은 `src/infra/indexeddb/**`(T-92 owns)의 몫이다.
 * `Settings` 에 넣지 않는 이유는 스펙 §4 그대로: `userSub`·커서는 기기별 값이라 동기화 대상이면
 * 다른 기기로 퍼진다.
 */
export type SyncState = {
  /** ADR-0026: 이 기기가 업데이트 후 서버 설정을 다시 받았는지 (개인 동기화 대상 아님). */
  settingsProfileVersion?: 1;
  /** 이 브라우저 프로필의 UUID. 로그아웃·계정 전환에도 유지(스펙 §4). */
  deviceId: string;
  /** 로그인된 구글 계정의 `sub`. 없으면 로그인 전(R8) 또는 로그아웃 후. */
  userSub?: string;
  /** 로그인된 계정의 이메일(스펙 R1 "표식 … 이메일 포함") — 계정 블록이 오프라인에서도 보여준다. */
  userEmail?: string;
  /** 마지막으로 받은 seq(풀 커서). */
  cursor: number;
  lastSyncedAt?: string;
  /** ③-4: 같은 로우가 `invalid` 로 연속 3회 거절되면 그 (tbl,id) 를 격리한다. */
  quarantined?: readonly { tbl: SyncTable; id: string }[];
  /**
   * 첫 로그인 R7 업로드 다이얼로그를 Esc·✕ 로 보류했는가(리뷰 Major 4). 참이면 다음 부팅
   * (`auth-actions.ts#resumeIfDeferred`)이 로컬 데이터가 아직 있는지 다시 보고, 있으면 다이얼로그를
   * 한 번 더 띄운다 — "다음 접속에 다시 묻는다"(R7) 는 문구를 실제로 지키는 자리가 여기다. 이 필드는
   * **기기별 결정 상태**라 동기화 대상 7테이블이 아니라 `SyncState`(§4 "새 로컬 개념 넷")에 둔다.
   */
  uploadDeferred?: boolean;
};
