// 동기화 트랜스포트 계약 (ADR-0018). 저장소가 아니라 네트워크 어댑터라 `Repositories` 에 넣지 않고
// `container.ts` 의 둘째 슬롯(`setSyncTransport`/`getSyncTransport`)에 둔다 — 이유는
// `sync-repository.ts` 머리주석과 §C-6(memory 가짜 서버가 앱 번들에 새지 않게 하는 경계).
//
// 실제 왕복은 `src/infra/sync/http-transport.ts`(fetch)와 `src/repositories/memory/sync-transport.ts`
// (테스트·개발용, 메모리 가짜 서버 위)가 구현한다. Worker(`worker/**`)는 이 타입을 모른다 — 서버 쪽
// 계약은 `@/domain/sync/wire`(왕복 모양)뿐이다.
import type { SyncRequest, SyncResponse } from '@/domain/sync/wire';

export type SessionInfo = { sub: string; email: string; expiresAt: string };

/**
 * 트랜스포트 실패의 갈래. UI 는 문구가 아니라 이 값으로 분기한다.
 *
 * `'account-deleted'`(ADR-0019, sync.md §6): 이 세션의 계정이 **다른 기기**에서 삭제됐다 —
 * worker 가 평범한 401 이 아니라 `410 + { error: 'account-deleted' }` 를 돌려준다
 * (`worker/auth/session.ts#requireSession`, `worker/router.ts#sessionErrorResponse`,
 * `worker/auth/handlers.ts#handleMe` — `/api/me`·`/api/sync` 둘 다 같은 모양). `'unauthorized'`
 * 와 구분해야 하는 이유: 401 은 "다시 로그인하세요"(조용히 로그인 화면으로)지만 이 값은
 * "말없이 버리지 않는다"(ADR-0015 §5) 는 결정에 따라 **안내 다이얼로그**를 거쳐야 한다.
 */
export type TransportFailure = 'unauthorized' | 'offline' | 'server' | 'account-deleted';

/**
 * 트랜스포트 실패. `RepositoryError` 와 같은 이유로 클래스를 쓴다(스택 트레이스·`instanceof` 판정 —
 * code-style §5 의 "클래스 금지"는 엔티티 규칙이라 에러 타입에는 적용되지 않는다).
 */
export class TransportError extends Error {
  readonly kind: TransportFailure;
  readonly status?: number;

  constructor(kind: TransportFailure, status?: number) {
    super(status === undefined ? kind : `${kind}(${String(status)})`);
    this.name = 'TransportError';
    this.kind = kind;
    this.status = status;
  }
}

/** 던져진 값이 트랜스포트 에러인지. */
export function isTransportError(value: unknown): value is TransportError {
  return value instanceof TransportError;
}

export interface SyncTransport {
  /** 세션 확인. 401 은 `null`(정상 분기), 410(계정 삭제)은 `TransportError('account-deleted')`,
   * 네트워크 실패는 `TransportError('offline')`. */
  me(): Promise<SessionInfo | null>;
  /** 한 왕복. 401 → `TransportError('unauthorized')`, 410 → `'account-deleted'`, 5xx →
   * `'server'`, fetch 실패 → `'offline'`. */
  sync(request: SyncRequest): Promise<SyncResponse>;
  logout(): Promise<void>;
  deleteAccount(): Promise<void>;
}
