'use client';

// 일(日) 피커 본문 (calendar-layout.md §3-A R15-a~R19-a). `DayPickerPopover` 가 Popover 안에서
// **지연 로드한다** — 초기 포커스(현재 값의 칸)는 이 컴포넌트의 effect 가 전담한다. 칸의 시각 언어는
// `DateCell` 과 같은 함수(`lib/cell-classes.ts`), 키 이동은 `lib/day-move.ts`, 격자 계산·요일 색·
// 범위는 월 보기의 것을 그대로 쓴다 — 달력에서 배운 표현을 여기서 다시 만나게 한다.
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { weekdayColor } from '@/features/date-strip/components/DateCell';
import { DayPickerMonthStep } from '@/features/date-strip/components/DayPickerMonthStep';
import { dayCellClass, dayNumberClass } from '@/features/date-strip/lib/cell-classes';
import { DAY_KEY_MOVE, moveDay } from '@/features/date-strip/lib/day-move';
import {
  WEEKDAY_LABELS,
  formatCellName,
  formatDayNumber,
  formatMonthLabel,
} from '@/features/date-strip/lib/format';
import {
  chunkIntoWeeks,
  isSameMonth,
  monthGridDays,
  shiftMonthWithinRange,
} from '@/features/date-strip/lib/month';
import { isWithinRange, shiftWithinRange } from '@/features/date-strip/lib/week';

import { Button } from '@/components/ui/Button';

import { cn } from '@/lib/cn';
import { isImeKey } from '@/lib/ime';

/** 낭독용 월 텍스트 디바운스 — `YearMonthPicker` 의 ANNOUNCE_DEBOUNCE_MS 와 같은 값·같은 이유. */
const ANNOUNCE_DEBOUNCE_MS = 300;

/** 한 줄(7칸)과 요일 머리글 줄이 공유하는 배치. 칸 32 + 간격 4 → 7×32 + 6×4 = 248 ≤ 안쪽 254(R18-a). */
const ROW_CLASS = 'flex justify-center gap-[var(--space-1)]';

type DayPickerProps = {
  /** 지금 값 — 열리면 이 칸에 포커스가 가고 선택 채움이 켜진다. */
  value: DateKey;
  today: DateKey;
  /** 격자 위 한 줄 안내(항목 메뉴에서 열 때 "어느 날로 옮길까요?"). 편집 패널은 주지 않는다. */
  hint?: string;
  /** 확정된 날짜 하나. 팝오버를 닫는 것은 호출 쪽 몫이다. */
  onPick: (date: DateKey) => void;
};

export function DayPicker({ value, today, hint, onPick }: DayPickerProps) {
  // roving tabindex 의 현재 칸이자 보고 있는 달의 기준. 달 이동(‹ › · PageUp/Down)도 이 값을 옮긴다.
  const [cursor, setCursor] = useState<DateKey>(value);
  const [fading, setFading] = useState(false);
  const monthLabel = formatMonthLabel(cursor);
  const [announcedMonth, setAnnouncedMonth] = useState(monthLabel);
  const cellRefs = useRef(new Map<DateKey, HTMLButtonElement>());
  // 마운트 직후(현재 값의 칸, R16-a)와 키 조작 뒤에만 focus() 한다 — 클릭·Tab 으로 들어온 포커스까지
  // 다시 focus() 하지 않는다.
  const shouldMoveFocus = useRef(true);
  const lastMonthRef = useRef(monthLabel);

  useEffect(() => {
    if (!shouldMoveFocus.current) return;
    shouldMoveFocus.current = false;
    cellRefs.current.get(cursor)?.focus();
  }, [cursor]);

  // 달이 바뀔 때만: 격자 opacity 크로스페이드(R19-a) + 낭독용 월 텍스트 디바운스(시각 텍스트는 즉시).
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncedMonth(monthLabel), ANNOUNCE_DEBOUNCE_MS);
    if (lastMonthRef.current === monthLabel) return () => window.clearTimeout(timer);
    lastMonthRef.current = monthLabel;
    setFading(true);
    const frame = requestAnimationFrame(() => setFading(false));
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [monthLabel]);

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (isImeKey(event.nativeEvent)) return;
    const move = DAY_KEY_MOVE[event.key];
    if (move === undefined) return;
    event.preventDefault();
    const next = moveDay(cursor, move);
    if (next === undefined) return;
    shouldMoveFocus.current = true;
    setCursor(next);
  };

  const prevMonth = shiftMonthWithinRange(cursor, -1);
  const nextMonth = shiftMonthWithinRange(cursor, 1);
  const tomorrow = shiftWithinRange(today, 1);

  return (
    // 폭은 부모 `Popover` 의 콘텐츠 상자를 그대로 채운다(YearMonthPicker 머리 주석과 같은 이유).
    <div className="flex w-full flex-col gap-[var(--space-3)]">
      {hint === undefined ? null : (
        <p className="text-[length:var(--text-xs)] leading-normal text-muted">{hint}</p>
      )}
      <div role="group" className="flex items-center justify-between">
        <DayPickerMonthStep direction={-1} target={prevMonth} onStep={setCursor} />
        {/* 시각 스팬은 접근 트리에서 빼고 디바운스된 sr-only 노드만 낭독한다(YearMonthPicker 와 같다). */}
        <span
          aria-hidden="true"
          className="text-[length:var(--text-lg)] leading-none font-bold text-text tabular-nums"
        >
          {monthLabel}
        </span>
        <span aria-live="polite" className="sr-only">
          {announcedMonth}
        </span>
        <DayPickerMonthStep direction={1} target={nextMonth} onStep={setCursor} />
      </div>

      <div
        role="grid"
        // 스트립·월 격자의 "날짜 선택" 과 다른 이름 — e2e 가 둘을 구분한다(R17-a).
        aria-label="날짜 고르기"
        className={cn(
          'flex flex-col gap-[var(--space-1)]',
          'motion-safe:transition-opacity motion-safe:duration-[var(--motion-xfast)] motion-safe:ease-[var(--motion-ease)]',
          // reduced-motion 에서 opacity-0 가 깜빡임이 되지 않도록 motion-safe: 로 가둔다(R19 와 같다).
          fading ? 'motion-safe:opacity-0' : 'opacity-100',
        )}
      >
        <div role="row" className={ROW_CLASS}>
          {WEEKDAY_LABELS.map((label, index) => (
            <span
              key={label}
              role="columnheader"
              className={cn(
                'flex h-[var(--space-5)] w-[var(--control-hit-min)] items-center justify-center text-[length:var(--text-xs)] leading-none',
                weekdayColor(index),
              )}
            >
              {label}
            </span>
          ))}
        </div>
        {/* 6줄 높이를 항상 확보한다 — 4·5줄 달로 넘어갈 때 [오늘][내일] 줄이 위아래로 튀지 않게. */}
        <div
          role="rowgroup"
          className="flex min-h-[calc(6*var(--control-hit-min)+5*var(--space-1))] flex-col gap-[var(--space-1)]"
        >
          {chunkIntoWeeks(monthGridDays(cursor)).map((row) => (
            <div key={row[0]} role="row" className={ROW_CLASS}>
              {row.map((day) => {
                const state = {
                  selected: day === value,
                  today: day === today,
                  outside: !isSameMonth(day, cursor),
                };
                return (
                  <button
                    key={day}
                    ref={(element) => {
                      if (element === null) cellRefs.current.delete(day);
                      else cellRefs.current.set(day, element);
                    }}
                    type="button"
                    role="gridcell"
                    aria-selected={state.selected}
                    aria-label={formatCellName({ date: day, isToday: state.today })}
                    disabled={!isWithinRange(day)}
                    tabIndex={day === cursor ? 0 : -1}
                    onClick={() => onPick(day)}
                    // 같은 달 안에서만 roving 위치를 따라간다 — 이 달 밖 칸 **클릭**에 달을 바꾸면 mousedown
                    // 과 click 사이에 칸이 다시 만들어져 클릭이 사라진다(스트립 회색 칸 버그와 같은 원인).
                    onFocus={() => {
                      if (!state.outside) setCursor(day);
                    }}
                    onKeyDown={handleKeyDown}
                    className={cn(
                      'flex size-[var(--control-hit-min)] items-center justify-center rounded-[var(--radius-lg)] text-[length:var(--text-base)] leading-none',
                      'motion-safe:transition-colors motion-safe:duration-[var(--motion-xfast)] motion-safe:ease-[var(--motion-ease)]',
                      'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                      'disabled:cursor-not-allowed disabled:opacity-40',
                      dayCellClass(state),
                    )}
                  >
                    <span className={dayNumberClass(state)}>{formatDayNumber(day)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-[var(--space-2)]">
        <Button variant="ghost" size="sm" disabled={value === today} onClick={() => onPick(today)}>
          오늘
        </Button>
        <Button
          variant="ghost"
          size="sm"
          disabled={tomorrow === undefined || value === tomorrow}
          onClick={() => tomorrow !== undefined && onPick(tomorrow)}
        >
          내일
        </Button>
      </div>
    </div>
  );
}
