// 실제 동기화 트랜스포트(ADR-0018) — Worker(T-93)의 `/api/me`·`/api/sync`·`/auth/logout`·
// `/api/account/delete` 위에서 `SyncTransport` 를 구현한다. 세션은 쿠키(`HttpOnly`)로 나른다 —
// `credentials: 'include'` 가 그 전제다. `vite.config.ts` 의 `server.proxy` 가 `/api`·`/auth` 를
// Worker(8787)로 넘긴다(T-93 owns, 개발 모드 한정 — 배포에서는 같은 오리진이다).
import type { SyncRequest, SyncResponse } from '@/domain/sync/wire';

import {
  TransportError,
  type SessionInfo,
  type SyncTransport,
} from '@/repositories/sync-transport';

/** CSRF 방어(T-93 완료 조건) — 둘 다 있어야 POST 를 받는다. GET 에도 붙여 두어 프록시·캐시가
 * 일관되게 취급하게 한다(해로울 것 없다). */
const HEADERS = { 'Content-Type': 'application/json', 'X-Tasky': '1' } as const;

async function safeFetch(path: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(path, { ...init, credentials: 'include' });
  } catch {
    throw new TransportError('offline');
  }
}

/**
 * 상태 코드만으로 갈래를 정한다 — 410 은 worker 가 이 앱에서 오직 계정 삭제(ADR-0019)에만 쓰는
 * 코드라 본문을 파싱할 필요가 없다(`worker/router.ts#sessionErrorResponse`,
 * `worker/auth/handlers.ts#handleMe` 실측: `/api/me`·`/api/sync`·`/auth/logout` 셋 다 같은 뜻).
 */
function failureFor(status: number): TransportError {
  if (status === 401) return new TransportError('unauthorized', status);
  if (status === 410) return new TransportError('account-deleted', status);
  return new TransportError('server', status);
}

async function parseJson(response: Response): Promise<unknown> {
  const text = await response.text();
  return text.length === 0 ? undefined : JSON.parse(text);
}

/** 앱이 쓰는 실제 트랜스포트. `src/app/providers.tsx`(T-94 owns) 가 `setSyncTransport` 에 주입한다. */
export function createHttpSyncTransport(): SyncTransport {
  return {
    me: async () => {
      const response = await safeFetch('/api/me', { method: 'GET', headers: HEADERS });
      if (response.status === 401) {
        return null;
      }
      if (!response.ok) {
        throw failureFor(response.status);
      }
      return (await parseJson(response)) as SessionInfo;
    },

    sync: async (body: SyncRequest): Promise<SyncResponse> => {
      const response = await safeFetch('/api/sync', {
        method: 'POST',
        headers: HEADERS,
        // ADR-0026: 프로필을 아는 클라이언트의 의도적인 삭제와 구버전 필드 누락을 구분한다.
        body: JSON.stringify({ ...body, settingsProfileVersion: 1 }),
      });
      if (!response.ok) {
        throw failureFor(response.status);
      }
      return (await parseJson(response)) as SyncResponse;
    },

    logout: async () => {
      const response = await safeFetch('/auth/logout', { method: 'POST', headers: HEADERS });
      if (!response.ok) {
        throw failureFor(response.status);
      }
    },

    deleteAccount: async () => {
      const response = await safeFetch('/api/account/delete', { method: 'POST', headers: HEADERS });
      if (!response.ok) {
        throw failureFor(response.status);
      }
    },

    logoutOthers: async () => {
      const response = await safeFetch('/auth/logout-others', { method: 'POST', headers: HEADERS });
      if (!response.ok) {
        throw failureFor(response.status);
      }
    },
  };
}
