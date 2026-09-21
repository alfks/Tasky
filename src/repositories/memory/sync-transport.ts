// 메모리 가짜 서버 위의 `SyncTransport` 구현(ADR-0018). **테스트 전용** — `sync-server.ts` 와 같은
// 이유로 앱 코드는 이 파일을 import 하지 않는다(§C-6, `src/test/setup.ts` 만 부른다).
import type { SyncRequest, SyncResponse } from '@/domain/sync/wire';

import type { MemorySyncServer } from '@/repositories/memory/sync-server';
import { TransportError } from '@/repositories/sync-transport';
import type { SessionInfo, SyncTransport } from '@/repositories/sync-transport';

export type MemorySyncTransportOptions = {
  /** true 면 모든 호출이 `TransportError('offline')` 을 던진다. 참조를 유지한 채 나중에 값을 바꿀 수
   * 있다(같은 옵션 객체를 들고 있는 테스트가 `options.offline = true` 로 토글). */
  offline?: boolean;
  /** `sync()` 가 서버에 넘기는 수신 시각. 기본은 `new Date().toISOString()`. */
  now?: () => string;
};

/**
 * `session` 이 `null` 이면 로그인 전(항상 `unauthorized`) — 세션은 트랜스포트 생성 시점에 고정된다.
 * 실제 HTTP 트랜스포트는 쿠키로 세션을 나르지만, 메모리 버전은 계정 전환·로그아웃을 시험할 때마다
 * 새 트랜스포트를 만드는 편이 프로덕션의 "브라우저 프로필 하나 = 세션 하나" 와 더 가깝다.
 */
export function createMemorySyncTransport(
  server: MemorySyncServer,
  session: SessionInfo | null,
  options: MemorySyncTransportOptions = {},
): SyncTransport {
  const now = options.now ?? (() => new Date().toISOString());
  const isOffline = (): boolean => options.offline === true;

  return {
    me: async () => {
      if (isOffline()) {
        throw new TransportError('offline');
      }
      return session;
    },

    sync: async (request: SyncRequest): Promise<SyncResponse> => {
      if (isOffline()) {
        throw new TransportError('offline');
      }
      if (session === null) {
        throw new TransportError('unauthorized');
      }
      return server.sync(session.sub, request.deviceId, request, now());
    },

    logout: async () => {
      if (isOffline()) {
        throw new TransportError('offline');
      }
    },

    deleteAccount: async () => {
      if (isOffline()) {
        throw new TransportError('offline');
      }
      if (session === null) {
        throw new TransportError('unauthorized');
      }
      server.deleteUser(session.sub);
    },

    // 가짜 서버·트랜스포트는 세션을 모델링하지 않는다(머리주석, 설계 문서 §6 "벡터 장치와의
    // 관계") — "이 트랜스포트가 든 세션 하나" 이상의 다기기 상태가 없으므로 지울 "다른 세션"도
    // 없다. 오프라인·미인증 갈래만 실 트랜스포트와 같게 맞춘다.
    logoutOthers: async () => {
      if (isOffline()) {
        throw new TransportError('offline');
      }
      if (session === null) {
        throw new TransportError('unauthorized');
      }
    },
  };
}
