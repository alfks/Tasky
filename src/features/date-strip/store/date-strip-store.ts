// 선택 날짜·오늘·보기 모드 상태 (date-strip.md R2·R4·R5·R6·R12·R14). 저장소를 읽지 않는다 — 요약 조회는 hooks 가 한다.
//
// 선택 날짜를 저장하지 않는 것이 요점이다(R2): 앱을 열면 언제나 오늘이다. 복원 로직을 넣으려면
// 스펙 R2 를 먼저 바꿔야 한다.
//
// **보기 모드(주/월)도 같은 이유로 저장하지 않는다(R14).** 이 스토어는 "앱을 열면 오늘, 한 주"
// 라는 한 가지 시작 상태만 갖는다 — 선택 날짜만 초기화하고 보기 모드는 복원하면, 새로고침 뒤
// 9월 한 달이 펼쳐진 채 선택만 오늘로 튀어 두 상태가 서로 다른 시점을 가리킨다. 저장하려면
// 이 스토어에 영속 계층이 새로 들어와야 하는데(지금은 저장소를 아예 읽지 않는다) 그것은
// R2 를 함께 뒤집는 결정이므로 스펙 변경이 먼저다.
import { create } from 'zustand';

import type { DateKey } from '@/domain/date/date-key';

import { clampToRange } from '@/features/date-strip/lib/week';

import { addDays, todayKey } from '@/lib/date';

/** 날짜를 보여주는 두 가지 모양 (R14). `week` 는 한 줄 7칸, `month` 는 달력 격자다. */
export type DateStripView = 'week' | 'month';

/** 스트립이 쓰는 날짜 상태와 조작. 전역 단축키(T-17)도 이 액션들을 부른다. */
export type DateStripState = {
  /** 지금 선택된 날짜. 스트립이 보여주는 주는 이 날짜에서 파생된다 (R1). */
  selectedDate: DateKey;
  /** 기기 로컬 시간대의 오늘. 자정을 넘기면 `refreshToday()` 가 갱신한다 (R12). */
  today: DateKey;
  /** 지금 보고 있는 모양. 앱을 열면 항상 `week` 다 — 저장하지 않는다 (R14, 위 주석). */
  view: DateStripView;
  /** 그 날짜를 선택한다. 이동 가능 범위 밖이면 양끝으로 당긴다 (R6). */
  select: (date: DateKey) => void;
  /** 선택 날짜를 `days` 일 옮긴다. `±1`(←/→), `±7`(‹/›·Shift+←/→) 둘 다 이것을 쓴다 (R4). */
  shiftSelected: (days: number) => void;
  /** 오늘을 선택한다. 오늘 값도 함께 갱신해 자정 직후의 한 박자 어긋남을 없앤다 (R5). */
  goToToday: () => void;
  /** 오늘 표시만 갱신한다. **선택 날짜는 바꾸지 않는다** (R12). */
  refreshToday: () => void;
  /** 주 ↔ 월 보기를 뒤집는다. **선택 날짜는 바뀌지 않는다** (R14). */
  toggleView: () => void;
};

/** 초기 상태. 모듈 로드 시 한 번 쓰이고, 테스트가 시계를 바꿔 다시 만들 때도 쓴다 (R2·R14). */
export function createInitialDateStripState(): Pick<
  DateStripState,
  'selectedDate' | 'today' | 'view'
> {
  const today = todayKey();
  return { selectedDate: clampToRange(today), today, view: 'week' };
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
  toggleView: () => set({ view: get().view === 'week' ? 'month' : 'week' }),
}));
