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

/**
 * 요청 하나의 시한. 절전에서 깨어난 노트북·백그라운드에서 멈췄다 돌아온 휴대폰·죽은 연결은 응답이
 * 영영 안 와서 fetch 가 끝나지 않을 수 있다. 동기화 엔진은 사이클 하나가 끝나야 다음 사이클을 돌리므로
 * (`sync-engine.ts` 의 `running` 가드) 이 대기가 무한이면 앱을 다시 열 때까지 **그 기기의 동기화가 통째로
 * 멈춘다** — 로컬에는 편집이 쌓이는데 서버로도, 서버에서도 아무것도 오가지 않는다. 시한이 지나면 오프라인과
 * 같은 갈래(`offline`)로 끝내 다음 트리거(포커스·쓰기·30초 폴링)가 새 요청을 보내게 한다. 30초 폴링보다
 * 길되, 느린 회선에서 큰 첫 업로드(요청 상한 2 MB)가 끊겨 영원히 못 끝나는 일은 없을 만큼으로 잡았다.
 */
export const REQUEST_TIMEOUT_MS = 45_000;

type Reply = { ok: boolean; status: number; text: string };

/** fetch + 본문 읽기를 **하나의 시한** 아래에서 한다 — 헤더만 오고 본문이 멈추는 경우도 덮는다. */
async function safeFetch(path: string, init: RequestInit): Promise<Reply> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(path, {
      ...init,
      credentials: 'include',
      signal: controller.signal,
    });
    return { ok: response.ok, status: response.status, text: await response.text() };
  } catch {
    throw new TransportError('offline');
  } finally {
    clearTimeout(timer);
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

function parseJson(reply: Reply): unknown {
  return reply.text.length === 0 ? undefined : JSON.parse(reply.text);
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
      return parseJson(response) as SessionInfo;
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
      return parseJson(response) as SyncResponse;
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
