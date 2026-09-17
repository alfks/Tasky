'use client';

// 날짜 스트립 (date-strip.md §2·§5). 이 앱을 열면 가장 먼저 보이고 가장 자주 만지는 부분이다.
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { DateCell } from '@/features/date-strip/components/DateCell';
import { DateStripHeader } from '@/features/date-strip/components/DateStripHeader';
import { useTodayTick } from '@/features/date-strip/hooks/useTodayTick';
import { useWeekSummaries } from '@/features/date-strip/hooks/useWeekSummaries';
import { isWithinRange, shiftWithinRange, weekDays } from '@/features/date-strip/lib/week';
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
};

/** 모션 축소 선호 여부. `matchMedia` 가 없는 런타임(구형·테스트)에서는 "선호하지 않음"으로 본다. */
function prefersReducedMotion(): boolean {
  if (typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function DateStrip({ summaryRevision, onDropTodo, onSummaryError }: DateStripProps) {
  const selectedDate = useDateStripStore((state) => state.selectedDate);
  const today = useDateStripStore((state) => state.today);
  const select = useDateStripStore((state) => state.select);
  useTodayTick();

  // 키보드 포커스는 선택과 **별개**다(§5: ←/→ 는 포커스 이동, Enter/Space 가 선택). 포커스가 주를
  // 넘어가면 보이는 주도 따라간다 — 오른쪽 끝에서 멈추거나 되감기는 것보다 날짜를 훑는 느낌에 가깝다.
  // 포커스가 스트립을 떠나면 null 로 돌려 보이는 주가 선택 날짜와 다시 맞는다.
  const [focusedDate, setFocusedDate] = useState<DateKey | null>(null);
  const activeDate = focusedDate ?? selectedDate;
  const days = weekDays(activeDate);
  const weekStart = days[0];
  const summaries = useWeekSummaries(weekStart, summaryRevision, onSummaryError);

  const cellRefs = useRef(new Map<DateKey, HTMLButtonElement>());
  // 클릭·Tab 으로 들어온 포커스까지 다시 focus() 하지 않도록, 키 조작으로 옮길 때만 켠다.
  const shouldMoveFocus = useRef(false);
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

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    // 스트립 안의 ←/→ 는 셀 이동이므로 전역 날짜 이동(shortcuts R1)으로 새어나가면 안 된다 (§5).
    const handlers: Record<string, () => void> = {
      ArrowLeft: () => moveFocus(shiftWithinRange(activeDate, -1)),
      ArrowRight: () => moveFocus(shiftWithinRange(activeDate, 1)),
      Home: () => moveFocus(days[0]),
      End: () => moveFocus(days[days.length - 1]),
    };
    const handler = handlers[event.key];
    if (handler === undefined) return;
    event.preventDefault();
    event.stopPropagation();
    handler();
  };

  return (
    <div className="flex flex-col gap-[var(--space-2)]">
      <DateStripHeader
        weekStart={weekStart}
        selectedDate={selectedDate}
        today={today}
        previousWeek={shiftWithinRange(selectedDate, -7)}
        nextWeek={shiftWithinRange(selectedDate, 7)}
        onSelect={selectFromHeader}
      />
      <div
        role="radiogroup"
        aria-label="날짜 선택"
        onBlur={(event) => {
          if (event.currentTarget.contains(event.relatedTarget)) return;
          setFocusedDate(null);
        }}
        // 간격은 어느 폭에서도 --space-2(8px) 다 (§2-A). 넓은 화면에서 `justify-between` 으로 늘리면
        // 조밀한 주 블록이 흩어진 버튼 7개로 읽히므로, 남는 폭은 블록을 가운데로 미는 데만 쓴다.
        className="flex snap-x snap-mandatory gap-[var(--space-2)] overflow-x-auto overscroll-x-contain md:justify-center md:overflow-x-visible"
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
              if (element === null) cellRefs.current.delete(day);
              else cellRefs.current.set(day, element);
            }}
            onSelect={select}
            onFocusCell={setFocusedDate}
            onKeyDown={handleKeyDown}
            onDropTodo={onDropTodo}
          />
        ))}
      </div>
    </div>
  );
}
