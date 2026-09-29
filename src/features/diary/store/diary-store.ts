// 다이어리 스토어 (diary.md R1~R4). 선택 날짜 하나의 기록 조회 + 생성/수정 + 소프트 삭제 + 되돌리기.
//
// 검증·생성·수정·삭제·되돌리기는 전부 `@/domain/diary/diary.rules` 의 순수 함수가 한다(복제 금지).
// 저장은 `@/repositories/container` 로 주입된 인터페이스로만.
import { create } from 'zustand';

import type { DateKey } from '@/domain/date/date-key';
import type { DiaryEntry } from '@/domain/diary/diary-entry';
import {
  createDiaryEntry,
  deleteDiaryEntry,
  editDiaryEntry,
  restoreDiaryEntry,
} from '@/domain/diary/diary.rules';
import { DomainError } from '@/domain/errors';
import { deletionStamp, type MetaDeps } from '@/domain/meta';

import { getRepositories } from '@/repositories/container';

import { nowIso } from '@/lib/date';
import { newId } from '@/lib/id';

/** 되돌리기 6초 창 동안 메모리에 드는 **삭제 직전 값** — 소프트 삭제된 뒤라 `getByDate()` 로는 다시 읽히지 않는다. */
type PendingRemoval = { entry: DiaryEntry; deletedAt: string };

export type DiaryLoadStatus = 'idle' | 'loading' | 'ready' | 'error';

export type DiaryState = {
  /** 지금 보고 있는 날짜. `load()` 를 한 번도 안 불렀으면 null. */
  date: DateKey | null;
  /** 그 날짜의 살아 있는 기록. 없으면 undefined — **빈 상태**(diary §2)다. */
  entry: DiaryEntry | undefined;
  status: DiaryLoadStatus;
  /** 사용자에게 그대로 보여줄 한국어 문구. */
  error: string | null;
  /** 되돌리기 창이 열려 있는 동안의 삭제 직전 값. */
  pendingRemoval: PendingRemoval | null;
};

export type DiaryActions = {
  /** 그 날짜의 기록을 읽어 상태를 채운다. 날짜를 옮길 때마다 부른다. */
  load: (date: DateKey) => Promise<void>;
  /**
   * 저장(diary R1~R3). 지금 날짜에 살아 있는 기록이 있으면 수정, 없으면 생성이다 — 어느 쪽인지는
   * **저장 직전 저장소를 다시 읽어** 정한다(두 번 눌러 두 개가 생기지 않게, diary.md §4).
   */
  save: (input: { emoji?: string; content: string }) => Promise<boolean>;
  /** 소프트 삭제 (R4). 지금 기록이 없으면 false. 성공하면 `pendingRemoval` 이 채워진다. */
  remove: () => Promise<boolean>;
  /** 되돌리기 (R4). `pendingRemoval` 이 없으면 false(되돌릴 것이 없는 것은 실패가 아니다). */
  undoRemove: () => Promise<boolean>;
  /** 되돌리기 창이 닫혔을 때(6초 경과·토스트 닫음). 메모를 버린다. */
  clearPendingRemoval: () => void;
  /** 대화상자를 다시 열 때 등, 지난 오류 문구를 지운다. */
  clearError: () => void;
};

export type DiaryStore = DiaryState & DiaryActions;

const SAVE_FAILED = '저장하지 못했어요. 다시 시도해 주세요';

function messageOf(error: unknown): string {
  return error instanceof DomainError ? error.message : SAVE_FAILED;
}

const initialState: DiaryState = {
  date: null,
  entry: undefined,
  status: 'idle',
  error: null,
  pendingRemoval: null,
};

const defaultDeps: MetaDeps = { now: nowIso, id: newId };

/** 스토어 팩토리. 앱은 아래 `useDiaryStore` 하나만 쓰고, 테스트는 결정적인 `deps` 로 격리된 인스턴스를 만든다. */
export function createDiaryStore(deps: MetaDeps = defaultDeps) {
  // 날짜를 빠르게 옮기면 먼저 보낸 조회가 나중에 끝날 수 있다 — 늦게 온 응답은 버린다.
  let seq = 0;

  return create<DiaryStore>()((set, get) => ({
    ...initialState,

    load: async (date) => {
      seq += 1;
      const mySeq = seq;
      // 같은 날짜를 다시 읽을 때는 되돌리기 메모를 지키고, 다른 날짜로 옮길 때만 버린다 — 카드가
      // 사이드바 드로어에 살면서 여닫기 = 마운트/언마운트가 됐고, 삭제 직후 드로어를 닫았다 6초 안에
      // 다시 여는 경로가 흔하다(리뷰 Major 1: 토스트 `[되돌리기]` 가 조용히 실패하던 자리).
      set((s) => ({
        date,
        status: 'loading',
        error: null,
        pendingRemoval: s.date === date ? s.pendingRemoval : null,
      }));
      try {
        const entry = await getRepositories().diaryEntries.getByDate(date);
        if (mySeq !== seq) return;
        set({ entry, status: 'ready' });
      } catch (error) {
        if (mySeq !== seq) return;
        set({ status: 'error', error: messageOf(error) });
      }
    },

    /**
     * **알고 접은 경쟁**(리뷰 Minor 3): `getByDate` 와 `upsert` 사이가 열려 있다 — 같은 날짜에
     * `save()` 두 번이 겹치면(탭 둘, 또는 느린 IndexedDB) 둘 다 `existing===undefined` 를 읽어
     * `createDiaryEntry` 를 두 번 타고 살아 있는 기록이 두 건 남을 수 있다.
     *
     * 막지 않은 이유: (1) UI 쪽 `saving` 가드(`DiaryDialog.tsx`)가 실제 경로에서는 두 번째 클릭
     * 자체를 막는다. (2) 그래도 두 건이 생기면 `getByDate` 가 `compareDiaryEntries`
     * (createdAt asc → id asc)로 **결정적으로 하나**를 고르므로 화면이 흔들리지 않는다(계약
     * 테스트 `같은 날짜에 살아 있는 두 건이 있으면 … createdAt 이 빠른 쪽을 돌려준다`). (3) 저장소
     * 트랜잭션으로 막으려면 `(date)` 원장을 유일 인덱스로 만들거나 조회+쓰기를 한 트랜잭션으로
     * 묶어야 하는데, 그러면 `DiaryRepository` 가 지금의 `upsert` 하나 계약(ADR-0007)을 벗어난다 —
     * 다이어리는 하루 한 번 쓰는 개인 기록이라 그 비용을 들일 만큼 동시 편집이 흔하지 않다고 판단했다.
     *
     * **루틴의 `(routineId, date)` 슬롯 id(ADR-0018)와 다른 선택인 이유**: 루틴 지연 생성은
     * 같은 슬롯을 **여러 날짜 스트립 조회가 반복해서** 겹쳐 채울 수 있는 배경 작업이라 조회 없이도
     * 결정적 id 로 멱등을 보장해야 했다. 다이어리는 **사람이 버튼을 눌러야만**
     * 일어나는 전면 조작이라 발생 빈도·파급이 다르고, `saving` 가드가 실질적으로 이미 닫는다.
     */
    save: async (input) => {
      const { date } = get();
      if (date === null) {
        return false;
      }
      let existing: DiaryEntry | undefined;
      try {
        existing = await getRepositories().diaryEntries.getByDate(date);
      } catch (error) {
        set({ error: messageOf(error) });
        return false;
      }
      let next;
      try {
        next =
          existing === undefined
            ? createDiaryEntry({ date, ...input }, existing, deps)
            : editDiaryEntry(existing, input, deps);
      } catch (error) {
        set({ error: messageOf(error) });
        return false;
      }
      try {
        await getRepositories().diaryEntries.upsert(next);
      } catch (error) {
        set({ error: messageOf(error) });
        return false;
      }
      set({ entry: next, error: null });
      return true;
    },

    remove: async () => {
      const { entry } = get();
      if (entry === undefined) {
        return false;
      }
      const deleted = deleteDiaryEntry(entry, deps);
      try {
        await getRepositories().diaryEntries.upsert(deleted);
      } catch (error) {
        set({ error: messageOf(error) });
        return false;
      }
      set({
        entry: undefined,
        pendingRemoval: { entry, ...deletionStamp(deleted) },
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
      const restored = restoreDiaryEntry(pending.entry, pending.deletedAt, deps);
      try {
        await getRepositories().diaryEntries.upsert(restored);
      } catch (error) {
        // 저장이 실패했으면 삭제 결과가 그대로 남아 있다 — 다시 누를 수 있게 슬롯을 복구한다.
        set({ pendingRemoval: pending, error: messageOf(error) });
        return false;
      }
      set({ entry: restored, error: null });
      return true;
    },

    clearPendingRemoval: () => set({ pendingRemoval: null }),
    clearError: () => set({ error: null }),
  }));
}

/** 앱이 쓰는 단 하나의 다이어리 스토어. */
export const useDiaryStore = createDiaryStore();
