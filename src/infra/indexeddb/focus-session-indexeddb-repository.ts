// IndexedDB 집중 세션 저장소. 정렬은 `compareFocusSessions` 하나로 고정한다.
import { isActiveFocusSession } from '@/domain/focus/focus-session.rules';

import type { FocusSessionRepository } from '@/repositories/focus-session-repository';
import { compareFocusSessions } from '@/repositories/ordering';

import { liveAll, liveBetween, liveBy, liveOne, put, type Store } from '@/infra/indexeddb/query';

/**
 * Dexie 테이블 위에서 동작하는 집중 세션 저장소.
 *
 * `getActive` 는 `status` 인덱스가 아니라 전량을 읽는다: 활성 판정(`running`|`paused`)이 도메인
 * 함수 하나(`isActiveFocusSession`)이고, 인덱스로 두 번 조회해 합치면 그 판정이 저장소로 복제된다.
 * 세션 수는 하루 수십 건 규모라 전량 읽기가 예산 안이다 — 규모가 커지면 `status` 인덱스로 바꾼다.
 */
export function createIndexedDbFocusSessionRepository(store: Store): FocusSessionRepository {
  const table = store.focusSessions;
  return {
    getActive: async () => {
      const active = (await liveAll(table)).filter(isActiveFocusSession);
      return active.sort(compareFocusSessions).at(-1);
    },
    getById: (id) => liveOne(table, id),
    listByDate: async (date) => (await liveBy(table, 'date', date)).sort(compareFocusSessions),
    listByDateRange: async (from, to) =>
      (await liveBetween(table, 'date', from, to)).sort(compareFocusSessions),
    listByTodo: async (todoId) =>
      (await liveBy(table, 'todoId', todoId)).sort(compareFocusSessions),
    listAll: async () => (await liveAll(table)).sort(compareFocusSessions),
    upsert: (session) => put(table, session),
  };
}
