import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { VIEW_PREF_KEY } from '@/features/date-strip/lib/view-pref';
import { MAX_DATE_KEY, MIN_DATE_KEY } from '@/features/date-strip/lib/week';
import {
  createInitialDateStripState,
  useDateStripStore,
} from '@/features/date-strip/store/date-strip-store';

/** 2026-09-17(목) 09:30 로컬. 시각을 고정해야 '오늘'이 흔들리지 않는다. */
const NOON = new Date(2026, 8, 17, 9, 30);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOON);
  // 보기 저장(R14)이 초기 상태에 새지 않게 — `toggleView` 를 부른 테스트 뒤에도 주 보기에서 시작한다.
  window.localStorage.clear();
  useDateStripStore.setState(createInitialDateStripState());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('R2. 앱 시작 시 선택 날짜는 항상 오늘이고 마지막 선택 날짜를 복원하지 않는다', () => {
  it('모듈을 새로 읽으면 선택 날짜가 그 시점의 오늘이다', async () => {
    vi.setSystemTime(new Date(2027, 1, 28, 23, 59));
    vi.resetModules();
    const fresh = await import('@/features/date-strip/store/date-strip-store');
    expect(fresh.useDateStripStore.getState().selectedDate).toBe('2027-02-28');
    expect(fresh.useDateStripStore.getState().today).toBe('2027-02-28');
  });

  it('다른 날을 골라 두어도 다시 읽으면 오늘로 돌아온다(복원 없음)', async () => {
    useDateStripStore.getState().select('2026-03-03');
    expect(useDateStripStore.getState().selectedDate).toBe('2026-03-03');

    vi.resetModules();
    const fresh = await import('@/features/date-strip/store/date-strip-store');
    expect(fresh.useDateStripStore.getState().selectedDate).toBe('2026-09-17');
  });

  it('선택 날짜를 브라우저 저장소에 쓰지 않는다', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    useDateStripStore.getState().select('2026-03-03');
    useDateStripStore.getState().shiftSelected(7);
    useDateStripStore.getState().goToToday();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });
});

describe('R14. 보기 모드는 기기별로 기억하고, 선택 날짜는 여전히 오늘이다', () => {
  it('toggleView 는 보기를 뒤집고 tasky.datestrip.v1 에 저장한다', () => {
    expect(useDateStripStore.getState().view).toBe('week');
    useDateStripStore.getState().toggleView();
    expect(useDateStripStore.getState().view).toBe('month');
    expect(window.localStorage.getItem(VIEW_PREF_KEY)).toBe(JSON.stringify({ view: 'month' }));
    useDateStripStore.getState().toggleView();
    expect(useDateStripStore.getState().view).toBe('week');
    expect(window.localStorage.getItem(VIEW_PREF_KEY)).toBe(JSON.stringify({ view: 'week' }));
  });

  it('월 보기로 두고 다시 읽으면 월 보기이고 선택 날짜는 오늘이다', async () => {
    useDateStripStore.getState().select('2026-03-03');
    useDateStripStore.getState().toggleView();

    vi.resetModules();
    const fresh = await import('@/features/date-strip/store/date-strip-store');
    expect(fresh.useDateStripStore.getState().view).toBe('month');
    expect(fresh.useDateStripStore.getState().selectedDate).toBe('2026-09-17');
  });

  it('createInitialDateStripState 에 view 를 주면 저장소를 읽지 않는다(테스트 격리 통로)', () => {
    useDateStripStore.getState().toggleView();
    expect(createInitialDateStripState().view).toBe('month');
    expect(createInitialDateStripState({ view: 'week' }).view).toBe('week');
    expect(createInitialDateStripState({}).view).toBe('month');
  });

  it('보기 저장은 선택 날짜를 건드리지 않는다 — 저장된 모양은 { view } 뿐이다', () => {
    useDateStripStore.getState().select('2026-03-03');
    useDateStripStore.getState().toggleView();
    expect(Object.keys(window.localStorage)).toEqual([VIEW_PREF_KEY]);
    expect(JSON.parse(window.localStorage.getItem(VIEW_PREF_KEY) ?? 'null')).toEqual({
      view: 'month',
    });
  });
});

describe('R4. 날짜 이동은 ±1일과 ±7일 둘 다 선택 날짜를 옮긴다', () => {
  it('±1일은 하루씩 옮긴다', () => {
    useDateStripStore.getState().shiftSelected(1);
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-18');
    useDateStripStore.getState().shiftSelected(-1);
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-17');
  });

  it('±7일은 요일을 유지한 채 일주일을 옮긴다', () => {
    useDateStripStore.getState().shiftSelected(-7);
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-10');
    useDateStripStore.getState().shiftSelected(7);
    useDateStripStore.getState().shiftSelected(7);
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-24');
  });

  it('월말·연말·윤일을 넘어가도 하루씩 이어진다', () => {
    useDateStripStore.getState().select('2026-09-30');
    useDateStripStore.getState().shiftSelected(1);
    expect(useDateStripStore.getState().selectedDate).toBe('2026-10-01');

    useDateStripStore.getState().select('2026-12-31');
    useDateStripStore.getState().shiftSelected(1);
    expect(useDateStripStore.getState().selectedDate).toBe('2027-01-01');

    useDateStripStore.getState().select('2028-02-28');
    useDateStripStore.getState().shiftSelected(1);
    expect(useDateStripStore.getState().selectedDate).toBe('2028-02-29');
  });
});

describe('R5. 오늘 이동은 선택 날짜를 오늘로 되돌린다', () => {
  it('goToToday 는 선택 날짜를 오늘로 맞춘다', () => {
    useDateStripStore.getState().select('2026-03-03');
    useDateStripStore.getState().goToToday();
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-17');
    expect(useDateStripStore.getState().selectedDate).toBe(useDateStripStore.getState().today);
  });

  it('자정을 넘긴 뒤의 goToToday 는 바뀐 오늘로 간다', () => {
    vi.setSystemTime(new Date(2026, 8, 18, 0, 0, 1));
    useDateStripStore.getState().goToToday();
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-18');
  });
});

describe('R6. 이동 가능 범위 밖으로는 선택이 나가지 않는다', () => {
  it('범위 밖으로 옮기면 양끝에서 멈춘다', () => {
    useDateStripStore.getState().select(MIN_DATE_KEY);
    useDateStripStore.getState().shiftSelected(-1);
    expect(useDateStripStore.getState().selectedDate).toBe(MIN_DATE_KEY);

    useDateStripStore.getState().select(MAX_DATE_KEY);
    useDateStripStore.getState().shiftSelected(7);
    expect(useDateStripStore.getState().selectedDate).toBe(MAX_DATE_KEY);
  });

  it('범위 밖 날짜를 직접 고르면 양끝으로 당겨진다', () => {
    useDateStripStore.getState().select('1900-01-01');
    expect(useDateStripStore.getState().selectedDate).toBe(MIN_DATE_KEY);
  });
});

describe('R12. 자정을 넘기면 오늘 표시가 갱신되고 선택 날짜는 바뀌지 않는다', () => {
  it('refreshToday 는 오늘만 갱신한다', () => {
    useDateStripStore.getState().select('2026-09-15');
    vi.setSystemTime(new Date(2026, 8, 18, 0, 0, 1));
    useDateStripStore.getState().refreshToday();
    expect(useDateStripStore.getState().today).toBe('2026-09-18');
    expect(useDateStripStore.getState().selectedDate).toBe('2026-09-15');
  });

  it('자정 전에는 오늘이 그대로다', () => {
    vi.setSystemTime(new Date(2026, 8, 17, 23, 59, 59));
    useDateStripStore.getState().refreshToday();
    expect(useDateStripStore.getState().today).toBe('2026-09-17');
  });
});
