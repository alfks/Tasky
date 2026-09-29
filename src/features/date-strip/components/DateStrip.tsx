'use client';

// 날짜 스트립 (date-strip.md §2·§5·R14~R17). 이 앱을 열면 가장 먼저 보이고 가장 자주 만지는 부분이다.
//
// 주 보기와 월 보기는 **같은 컴포넌트의 두 배치**다(R14). 선택·포커스·요약 조회·키보드 이동은 여기
// 한 곳에서 돌고, 갈리는 것은 (1) 보이는 날짜 목록, (2) 칸을 어떤 상자에 담느냐 둘뿐이다. 보기마다
// 컴포넌트를 나누면 무효화 배선(T-56)과 포커스 규약이 두 벌이 되고, 한쪽만 고쳐지는 순간 다른 쪽에서
// 조용히 되살아난다.
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { DateCell } from '@/features/date-strip/components/DateCell';
import { DateStripHeader } from '@/features/date-strip/components/DateStripHeader';
import { MonthGrid } from '@/features/date-strip/components/MonthGrid';
import { useRangeSummaries } from '@/features/date-strip/hooks/useRangeSummaries';
import { useTodayTick } from '@/features/date-strip/hooks/useTodayTick';
import { useVisibleRangeNotifier } from '@/features/date-strip/hooks/useVisibleRangeNotifier';
import { isSameMonth, monthGridDays, shiftMonthWithinRange } from '@/features/date-strip/lib/month';
import {
  DAYS_IN_WEEK,
  isWithinRange,
  shiftWithinRange,
  weekDays,
} from '@/features/date-strip/lib/week';
import { useDateStripStore } from '@/features/date-strip/store/date-strip-store';

type DateStripProps = {
  /**
   * **저장소가 바뀌었다는 신호** — 값이 바뀌면 주 요약(점·✓·셀 접근성 이름)을 다시 읽는다 (T-56).
   *
   * **옵셔널이 아닌 이유**: 스트립은 자기 투두를 따로 조회해 캐시하므로 이 신호가 없으면 체크·추가·
   * 삭제·가져오기 뒤에도 화면이 낡은 채로 남는다. 옵셔널로 두면 호출부가 잊는 순간 그 버그가 **조용히**
   * 돌아온다 — 필수로 두면 잊는 순간 타입 에러다. 스트립 자신은 `todo`·`backup` 을 import 할 수 없어
   * (feature 그래프의 리프 — `import/no-cycle`) 무엇을 합칠지는 셸이 정한다(`ShellHeader`).
   */
  summaryRevision: number;
  /** 투두를 셀에 떨어뜨렸을 때 (R13). 없으면 셀이 드롭을 받지 않는다. */
  onDropTodo?: (todoId: string, date: DateKey) => void;
  /** 요약 조회 실패 문구. 토스트로 띄우는 것은 앱 셸 소관이다 (§2-C). */
  onSummaryError?: (message: string) => void;
  /**
   * 보이는 날짜 범위(양끝 포함)가 바뀔 때마다 알린다 (routine.md R6 무기한 루틴 지연 생성의 배선
   * 지점). 스트립 자신은 `todo` 를 import 할 수 없어(feature 그래프의 리프) 셸이 이 콜백으로 받아
   * 잇는다(`ShellHeader`) — `summaryRevision` 과 같은 이유(위 주석). **leading + trailing 으로
   * 디바운스된다** — 규칙·근거·폭(`VISIBLE_RANGE_DEBOUNCE_MS`)은 `hooks/useVisibleRangeNotifier.ts`.
   */
  onVisibleRange?: (from: DateKey, to: DateKey) => void;
};

/** 모션 축소 선호 여부. `matchMedia` 가 없는 런타임(구형·테스트)에서는 "선호하지 않음"으로 본다. */
function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function DateStrip({
  summaryRevision,
  onDropTodo,
  onSummaryError,
  onVisibleRange,
}: DateStripProps) {
  const selectedDate = useDateStripStore((state) => state.selectedDate);
  const today = useDateStripStore((state) => state.today);
  const select = useDateStripStore((state) => state.select);
  const view = useDateStripStore((state) => state.view);
  const toggleView = useDateStripStore((state) => state.toggleView);
  useTodayTick();

  // 키보드 포커스는 선택과 **별개**다(§5: ←/→ 는 포커스 이동, Enter/Space 가 선택). 포커스가 주를
  // 넘어가면 보이는 주도 따라간다 — 오른쪽 끝에서 멈추거나 되감기는 것보다 날짜를 훑는 느낌에 가깝다.
  // 포커스가 스트립을 떠나면 null 로 돌려 보이는 주가 선택 날짜와 다시 맞는다.
  const [focusedDate, setFocusedDate] = useState<DateKey | null>(null);
  const activeDate = focusedDate ?? selectedDate;
  const isMonth = view === 'month';
  // 보이는 날짜. 주 보기는 7칸, 월 보기는 그 달의 격자 전부(28~42칸) — 둘 다 **연속 범위**다 (R15).
  const days = isMonth ? monthGridDays(activeDate) : weekDays(activeDate);
  // 그래서 요약은 칸 수와 무관하게 **양끝만 넘겨 한 번**에 읽는다 (R17).
  const rangeStart = days[0];
  const rangeEnd = days[days.length - 1];
  const summaries = useRangeSummaries(rangeStart, rangeEnd, summaryRevision, onSummaryError);
  useVisibleRangeNotifier(rangeStart, rangeEnd, onVisibleRange);

  const cellRefs = useRef(new Map<DateKey, HTMLButtonElement>());
  // 클릭·Tab 으로 들어온 포커스까지 다시 focus() 하지 않도록, 키 조작으로 옮길 때만 켠다.
  const shouldMoveFocus = useRef(false);
  // DOM 포커스가 실제로 있는 칸. 앵커와 다를 수 있어(`handleFocusCell`) 키 이동은 이것에서 출발한다.
  const focusedCellDate = useRef<DateKey | null>(null);
  // 헤더 버튼이 자기 클릭으로 비활성될 때 포커스를 넘겨받을 셀 (WCAG 2.4.3).
  const shouldAdoptFocus = useRef(false);

  useEffect(() => {
    if (!shouldMoveFocus.current || focusedDate === null) return;
    shouldMoveFocus.current = false;
    cellRefs.current.get(focusedDate)?.focus();
  }, [focusedDate]);

  useEffect(() => {
    // `[오늘]`·`‹`·`›` 는 눌리는 순간 비활성이 될 수 있고, 그러면 브라우저가 포커스를 <body> 로 떨군다.
    // 다음 Tab 이 스트립을 통째로 건너뛰므로, 비활성이 확정되는 이 렌더에서 선택 셀이 포커스를 받는다.
    if (!shouldAdoptFocus.current) return;
    shouldAdoptFocus.current = false;
    cellRefs.current.get(selectedDate)?.focus();
  }, [selectedDate]);

  /** 헤더에서 온 선택. `adoptFocus` 면 방금 누른 버튼이 비활성되므로 선택 셀이 포커스를 넘겨받는다. */
  const selectFromHeader = (date: DateKey, adoptFocus = false) => {
    shouldAdoptFocus.current = adoptFocus;
    select(date);
  };

  useEffect(() => {
    // 좁은 화면(§2-B)에서 선택 셀을 가운데로. 넓은 화면에서는 스크롤이 없어 아무 일도 하지 않는다.
    const cell = cellRefs.current.get(selectedDate);
    if (cell === undefined || typeof cell.scrollIntoView !== 'function') return;
    cell.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [selectedDate]);

  const moveFocus = (target: DateKey | undefined) => {
    if (target === undefined || !isWithinRange(target)) return;
    shouldMoveFocus.current = true;
    setFocusedDate(target);
  };

  /**
   * **포커스만으로는 보이는 범위가 바뀌지 않는다(R16)** — 월 보기의 이 달 밖 칸은 앵커를 옮기지 않는다.
   * 옮기면 격자가 click 보다 먼저 다시 그려져 click 이 다른 칸(또는 조상)에 떨어지고 선택이 안 됐다
   * (마우스·터치 실브라우저 재현 — jsdom 은 요소 참조를 유지해 못 잡는다). 닿을 수 있는 칸은 보이는
   * 칸뿐이고 주 보기의 칸은 전부 같은 주라 그림이 바뀌는 경우는 이것 하나다. 키보드 이동(R18)은
   * `moveFocus` 가 앵커를 먼저 옮기므로 그 뒤의 focus 는 이미 같은 달이다.
   */
  const handleFocusCell = (date: DateKey) => {
    focusedCellDate.current = date;
    if (isMonth && !isSameMonth(date, activeDate)) return;
    setFocusedDate(date);
  };

  /**
   * 칸을 눌러 확정한 선택. 앵커를 비워 보이는 범위가 **선택 날짜**를 따르게 한다 — 이 달 밖 칸이면 그 날이
   * 든 달로 격자가 넘어간다(R16). 줄의 키가 월요일이고 격자는 온전한 주라 누른 칸은 같은 요소로 남는다(포커스 유지).
   */
  const handleSelect = (date: DateKey) => {
    setFocusedDate(null);
    select(date);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // 출발점은 포커스가 실제로 있는 칸(앵커와 어긋나도 — 이 달 밖 칸을 누르고 밖에서 놓음 — 보이는 칸에서
    // 움직인다). ↑/↓ · Home/End 는 보기와 무관하게 그 칸이 속한 주 기준이다 (R18).
    const origin = focusedCellDate.current ?? activeDate;
    const originWeek = weekDays(origin);
    // 스트립 안의 ←/→ 는 셀 이동이므로 전역 날짜 이동(shortcuts R1)으로 새어나가면 안 된다 (§5).
    const handlers: Record<string, () => void> = {
      ArrowLeft: () => moveFocus(shiftWithinRange(origin, -1)),
      ArrowRight: () => moveFocus(shiftWithinRange(origin, 1)),
      Home: () => moveFocus(originWeek[0]),
      End: () => moveFocus(originWeek[DAYS_IN_WEEK - 1]),
    };
    // ↑/↓ 는 **월 보기에서만** 잡는다 (R18). 한 줄짜리 주 보기에서 위아래는 갈 곳이 없고, 거기서
    // 삼키면 브라우저 기본 스크롤만 죽는다. 등록된 전역 단축키와도 겹치지 않는다
    // (shortcut-catalog: ↑/↓ 단독은 없고 Alt+↑/↓ 는 투두 항목에 포커스가 있을 때만 도는 item 범위다).
    if (isMonth) {
      handlers.ArrowUp = () => moveFocus(shiftWithinRange(origin, -DAYS_IN_WEEK));
      handlers.ArrowDown = () => moveFocus(shiftWithinRange(origin, DAYS_IN_WEEK));
    }
    const handler = handlers[event.key];
    if (handler === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    handler();
  };

  /** 한 칸 이동(주 보기 ±7일, 월 보기 ±1달)한 날짜. 범위(R6) 밖이면 `undefined` 다. */
  const stepFrom = (date: DateKey, direction: -1 | 1): DateKey | undefined =>
    isMonth
      ? shiftMonthWithinRange(date, direction)
      : shiftWithinRange(date, direction * DAYS_IN_WEEK);

  const registerCell = (date: DateKey, element: HTMLButtonElement | null) => {
    if (element === null) cellRefs.current.delete(date);
    else cellRefs.current.set(date, element);
  };

  /**
   * 포커스가 칸 묶음을 **떠나면** 보이는 날짜가 선택 날짜와 다시 맞는다. 헤더는 이 묶음 밖이라,
   * 셀에서 [오늘]·‹ 로 Tab 하면 여기가 돈다 — 두 보기가 같은 규약을 쓰도록 한 곳에 둔다.
   */
  const clearFocusOnLeave = (event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    focusedCellDate.current = null;
    setFocusedDate(null);
  };

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <DateStripHeader
        // 월 표시는 주 보기에서 보이는 주의 월요일을, 월 보기에서 보고 있는 달을 따른다.
        anchorDate={isMonth ? activeDate : days[0]}
        selectedDate={selectedDate}
        today={today}
        view={view}
        previousStep={stepFrom(selectedDate, -1)}
        nextStep={stepFrom(selectedDate, 1)}
        hasStepAfter={(target, direction) => stepFrom(target, direction) !== undefined}
        onToggleView={toggleView}
        onSelect={selectFromHeader}
      />
      {isMonth ? (
        <MonthGrid
          days={days}
          anchorDate={activeDate}
          selectedDate={selectedDate}
          today={today}
          focusDate={activeDate}
          summaries={summaries}
          onCellRef={registerCell}
          onBlur={clearFocusOnLeave}
          onSelect={handleSelect}
          onFocusCell={handleFocusCell}
          onKeyDown={handleKeyDown}
          onDropTodo={onDropTodo}
        />
      ) : (
        <div
          role="radiogroup"
          aria-label="날짜 선택"
          onBlur={clearFocusOnLeave}
          // 간격은 밀도 토큰 --cal-gap 이다(calendar-layout.md §2 R12, MonthGrid 와 같은 값). 넓은
          // 화면에서 `justify-between` 으로 늘리면 조밀한 주 블록이 흩어진 버튼 7개로 읽히므로, 남는
          // 폭은 블록을 가운데로 미는 데만 쓴다. **모든 폭에서** 가운데다(`safe center`, §2-B — 1열에서
          // 왼쪽에 붙어 치우쳐 보였다). 넘치면 자동으로 시작 정렬이라 왼쪽 칸이 잘리지 않는다.
          className="flex snap-x snap-mandatory justify-center-safe gap-[var(--cal-gap)] overflow-x-auto overscroll-x-contain md:overflow-x-visible"
        >
          {days.map((day) => (
            <DateCell
              key={day}
              date={day}
              isSelected={day === selectedDate}
              isToday={day === today}
              isFocusTarget={day === activeDate}
              isDisabled={!isWithinRange(day)}
              summary={summaries?.get(day)}
              buttonRef={(element) => {
                registerCell(day, element);
              }}
              onSelect={handleSelect}
              onFocusCell={handleFocusCell}
              onKeyDown={handleKeyDown}
              onDropTodo={onDropTodo}
            />
          ))}
        </div>
      )}
    </div>
  );
}
