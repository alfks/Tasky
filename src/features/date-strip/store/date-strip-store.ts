// 선택 날짜·오늘·보기 모드 상태 (date-strip.md R2·R4·R5·R6·R12·R14). 저장소를 읽지 않는다 — 요약 조회는 hooks 가 한다.
//
// 선택 날짜를 저장하지 않는 것이 요점이다(R2): 앱을 열면 언제나 오늘이다. 복원 로직을 넣으려면
// 스펙 R2 를 먼저 바꿔야 한다.
//
// **보기 모드(주/월)는 기기별로 기억한다(R14, `lib/view-pref.ts`).** 선택 날짜와 달리 "어떤 모양으로
// 보나" 는 취향이라 새로고침마다 주 보기로 되돌리면 월 보기를 쓰는 사람이 매번 다시 눌러야 한다.
// 두 상태가 어긋날 우려는 없다 — 선택이 언제나 오늘이면 월 격자도 언제나 오늘이 든 달이다.
// 저장은 localStorage 한 키뿐이고 백업·동기화에 들어가지 않는다(app-shell.md R5 와 같은 부류).
import { create } from 'zustand';

import type { DateKey } from '@/domain/date/date-key';

import {
  readViewPref,
  writeViewPref,
  type DateStripView,
} from '@/features/date-strip/lib/view-pref';
import { clampToRange } from '@/features/date-strip/lib/week';

import { addDays, todayKey } from '@/lib/date';

/** 타입의 단일 소스는 `lib/view-pref.ts` 다 — 저장 형식과 같은 파일에 산다. 호출부는 계속 여기서 받는다. */
export type { DateStripView };

/** 스트립이 쓰는 날짜 상태와 조작. 전역 단축키(T-17)도 이 액션들을 부른다. */
export type DateStripState = {
  /** 지금 선택된 날짜. 스트립이 보여주는 주는 이 날짜에서 파생된다 (R1). */
  selectedDate: DateKey;
  /** 기기 로컬 시간대의 오늘. 자정을 넘기면 `refreshToday()` 가 갱신한다 (R12). */
  today: DateKey;
  /** 지금 보고 있는 모양. 앱을 열면 마지막으로 보던 모양이다 — 기기별로 저장한다 (R14, 위 주석). */
  view: DateStripView;
  /** 그 날짜를 선택한다. 이동 가능 범위 밖이면 양끝으로 당긴다 (R6). */
  select: (date: DateKey) => void;
  /** 선택 날짜를 `days` 일 옮긴다. `±1`(←/→), `±7`(‹/›·Shift+←/→) 둘 다 이것을 쓴다 (R4). */
  shiftSelected: (days: number) => void;
  /** 오늘을 선택한다. 오늘 값도 함께 갱신해 자정 직후의 한 박자 어긋남을 없앤다 (R5). */
  goToToday: () => void;
  /** 오늘 표시만 갱신한다. **선택 날짜는 바꾸지 않는다** (R12). */
  refreshToday: () => void;
  /** 주 ↔ 월 보기를 뒤집고 기기에 저장한다. **선택 날짜는 바뀌지 않는다** (R14). */
  toggleView: () => void;
};

/**
 * 초기 상태. 모듈 로드 시 한 번 쓰이고, 테스트가 시계를 바꿔 다시 만들 때도 쓴다 (R2·R14).
 * `view` 를 주면 저장소를 읽지 않는다 — 테스트가 localStorage 에 좌우되지 않게 하는 통로다.
 */
export function createInitialDateStripState({
  view = readViewPref(),
}: { view?: DateStripView } = {}): Pick<DateStripState, 'selectedDate' | 'today' | 'view'> {
  const today = todayKey();
  return { selectedDate: clampToRange(today), today, view };
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
  toggleView: () => {
    const view: DateStripView = get().view === 'week' ? 'month' : 'week';
    writeViewPref(view);
    set({ view });
  },
}));
