// 선택 날짜·오늘 상태 (date-strip.md R2·R4·R5·R6·R12). 저장소를 읽지 않는다 — 요약 조회는 hooks 가 한다.
//
// 선택 날짜를 저장하지 않는 것이 요점이다(R2): 앱을 열면 언제나 오늘이다. 복원 로직을 넣으려면
// 스펙 R2 를 먼저 바꿔야 한다.
import { create } from 'zustand';

import type { DateKey } from '@/domain/date/date-key';

import { clampToRange } from '@/features/date-strip/lib/week';

import { addDays, todayKey } from '@/lib/date';

/** 스트립이 쓰는 날짜 상태와 조작. 전역 단축키(T-17)도 이 액션들을 부른다. */
export type DateStripState = {
  /** 지금 선택된 날짜. 스트립이 보여주는 주는 이 날짜에서 파생된다 (R1). */
  selectedDate: DateKey;
  /** 기기 로컬 시간대의 오늘. 자정을 넘기면 `refreshToday()` 가 갱신한다 (R12). */
  today: DateKey;
  /** 그 날짜를 선택한다. 이동 가능 범위 밖이면 양끝으로 당긴다 (R6). */
  select: (date: DateKey) => void;
  /** 선택 날짜를 `days` 일 옮긴다. `±1`(←/→), `±7`(‹/›·Shift+←/→) 둘 다 이것을 쓴다 (R4). */
  shiftSelected: (days: number) => void;
  /** 오늘을 선택한다. 오늘 값도 함께 갱신해 자정 직후의 한 박자 어긋남을 없앤다 (R5). */
  goToToday: () => void;
  /** 오늘 표시만 갱신한다. **선택 날짜는 바꾸지 않는다** (R12). */
  refreshToday: () => void;
};

/** 초기 상태. 모듈 로드 시 한 번 쓰이고, 테스트가 시계를 바꿔 다시 만들 때도 쓴다 (R2). */
export function createInitialDateStripState(): Pick<DateStripState, 'selectedDate' | 'today'> {
  const today = todayKey();
  return { selectedDate: clampToRange(today), today };
}

export const useDateStripStore = create<DateStripState>((set, get) => ({
  ...createInitialDateStripState(),
  select: (date) => set({ selectedDate: clampToRange(date) }),
  shiftSelected: (days) => set({ selectedDate: clampToRange(addDays(get().selectedDate, days)) }),
  goToToday: () => {
    const today = todayKey();
    set({ today, selectedDate: clampToRange(today) });
  },
  refreshToday: () => set({ today: todayKey() }),
}));
