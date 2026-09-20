// D-day 스토어 (calendar.md R1·R4·R5). 전량 조회 하나(계약 §4) + 생성 + 소프트 삭제 + 되돌리기.
//
// 정렬·D-n 계산·검증은 전부 `@/domain/dday/dday.rules` 의 순수 함수가 한다(복제 금지 — 복제하면
// 메모리 상태와 도메인 규칙이 갈린다). 저장은 `@/repositories/container` 로 주입된 인터페이스로만.
import { create } from 'zustand';

import type { Dday } from '@/domain/dday/dday';
import { createDday, deleteDday, restoreDday } from '@/domain/dday/dday.rules';
import { DomainError } from '@/domain/errors';
import { deletionStamp, type MetaDeps } from '@/domain/meta';

import { getRepositories } from '@/repositories/container';

import { nowIso } from '@/lib/date';
import { newId } from '@/lib/id';

/** 되돌리기 6초 창 동안 메모리에 드는 **삭제 직전 값** — 소프트 삭제된 뒤라 `list()` 로는 다시 읽히지 않는다. */
type PendingRemoval = { dday: Dday; deletedAt: string };

export type DdayLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export type DdayState = {
  /** 전량(툼스톤 제외). 정렬은 컴포넌트가 `sortDdays` 로 파생한다. */
  ddays: readonly Dday[];
  status: DdayLoadStatus;
  /** 사용자에게 그대로 보여줄 한국어 문구. */
  error: string | null;
  /** 되돌리기 창이 열려 있는 동안의 삭제 직전 값. */
  pendingRemoval: PendingRemoval | null;
};

export type DdayActions = {
  /** 전량을 읽어 메모리를 교체한다. */
  load: () => Promise<void>;
  /** 새 D-day (R1). 검증 실패·저장 실패는 `false` + `error` 에 문구가 남는다. */
  add: (input: { title: string; date: string }) => Promise<boolean>;
  /** 소프트 삭제 (R5). 성공하면 `pendingRemoval` 이 채워지고 호출자가 되돌리기 토스트를 띄운다. */
  remove: (id: string) => Promise<boolean>;
  /** 되돌리기 (R5). `pendingRemoval` 이 없으면 `false`(되돌릴 것이 없는 것은 실패가 아니다). */
  undoRemove: () => Promise<boolean>;
  /** 되돌리기 창이 닫혔을 때(6초 경과·토스트 닫음). 메모를 버린다. */
  clearPendingRemoval: () => void;
  /** 토스트를 닫을 때 문구를 지운다. */
  clearError: () => void;
};

export type DdayStore = DdayState & DdayActions;

const SAVE_FAILED = '저장하지 못했어요. 다시 시도해 주세요';

function messageOf(error: unknown): string {
  return error instanceof DomainError ? error.message : SAVE_FAILED;
}

const initialState: DdayState = {
  ddays: [],
  status: 'idle',
  error: null,
  pendingRemoval: null,
};

const defaultDeps: MetaDeps = { now: nowIso, id: newId };

/** 스토어 팩토리. 앱은 아래 `useDdayStore` 하나만 쓰고, 테스트는 결정적인 `deps` 로 격리된 인스턴스를 만든다. */
export function createDdayStore(deps: MetaDeps = defaultDeps) {
  return create<DdayStore>()((set, get) => ({
    ...initialState,

    load: async () => {
      set({ status: 'loading', error: null });
      try {
        const ddays = await getRepositories().dday.list();
        set({ ddays, status: 'ready' });
      } catch (error) {
        set({ status: 'error', error: messageOf(error) });
      }
    },

    add: async (input) => {
      let created;
      try {
        created = createDday(input, get().ddays, deps);
      } catch (error) {
        set({ error: messageOf(error) });
        return false;
      }
      try {
        await getRepositories().dday.upsert(created);
      } catch (error) {
        set({ error: messageOf(error) });
        return false;
      }
      set({ ddays: [...get().ddays, created], error: null });
      return true;
    },

    remove: async (id) => {
      const dday = get().ddays.find((row) => row.id === id);
      if (dday === undefined) {
        return false;
      }
      const deleted = deleteDday(dday, deps);
      try {
        await getRepositories().dday.upsert(deleted);
      } catch (error) {
        set({ error: messageOf(error) });
        return false;
      }
      set({
        ddays: get().ddays.filter((row) => row.id !== id),
        pendingRemoval: { dday, ...deletionStamp(deleted) },
        error: null,
      });
      return true;
    },

    undoRemove: async () => {
      const pending = get().pendingRemoval;
      if (pending === null) {
        return false;
      }
      set({ pendingRemoval: null });
      const restored = restoreDday(pending.dday, pending.deletedAt, deps);
      try {
        await getRepositories().dday.upsert(restored);
      } catch (error) {
        // 저장이 실패했으면 삭제 결과가 그대로 남아 있다 — 다시 누를 수 있게 슬롯을 복구한다.
        set({ pendingRemoval: pending, error: messageOf(error) });
        return false;
      }
      set({ ddays: [...get().ddays, restored], error: null });
      return true;
    },

    clearPendingRemoval: () => set({ pendingRemoval: null }),
    clearError: () => set({ error: null }),
  }));
}

/** 앱이 쓰는 단 하나의 D-day 스토어. */
export const useDdayStore = createDdayStore();
