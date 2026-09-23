'use client';

// 월 보기의 달력 격자 (date-strip.md R15·R16·§5).
//
// 칸은 만들지 않는다 — `DateCell` 을 그대로 쓰고 `variant="month"` 만 준다. 오늘 링·선택 채움·점·✓ 는
// 주 보기와 **같은 코드 한 벌**에서 나온다(R16). 이 파일이 맡는 것은 배치와 격자 역할뿐이다.
import type { FocusEvent, KeyboardEvent } from 'react';

import type { DateKey } from '@/domain/date/date-key';
import type { DaySummary } from '@/domain/todo/day-summary';

import { DateCell, weekdayColor } from '@/features/date-strip/components/DateCell';
import { WEEKDAY_LABELS } from '@/features/date-strip/lib/format';
import { chunkIntoWeeks, isSameMonth } from '@/features/date-strip/lib/month';
import { isWithinRange } from '@/features/date-strip/lib/week';

import { cn } from '@/lib/cn';

type MonthGridProps = {
  /** 격자에 그릴 날짜 전부. `monthGridDays` 가 낸 7의 배수 연속 범위다 (R15). */
  days: readonly DateKey[];
  /** 지금 보고 있는 달의 아무 날짜. 이 달 밖 칸은 숫자가 흐려진다 (R16). */
  anchorDate: DateKey;
  selectedDate: DateKey;
  today: DateKey;
  /** roving tabindex 의 현재 진입점 (§5). 격자에서 `tabIndex=0` 인 칸은 하나뿐이다. */
  focusDate: DateKey;
  /** 아직 못 읽었으면 `undefined` — 칸은 그대로 그리고 점만 늦게 붙는다 (§2-C). */
  summaries?: ReadonlyMap<DateKey, DaySummary>;
  onCellRef: (date: DateKey, element: HTMLButtonElement | null) => void;
  /** 포커스가 격자를 떠날 때. 주 보기의 radiogroup 과 같은 규약을 쓴다 (§5). */
  onBlur: (event: FocusEvent<HTMLElement>) => void;
  onSelect: (date: DateKey) => void;
  onFocusCell: (date: DateKey) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  onDropTodo?: (todoId: string, date: DateKey) => void;
};

/** 한 줄(7칸)과 요일 머리글 줄이 공유하는 배치. 간격은 밀도 토큰 --cal-gap(calendar-layout.md §2 R12). */
const ROW_CLASS = 'flex justify-center gap-[var(--cal-gap)]';

export function MonthGrid({
  days,
  anchorDate,
  selectedDate,
  today,
  focusDate,
  summaries,
  onCellRef,
  onBlur,
  onSelect,
  onFocusCell,
  onKeyDown,
  onDropTodo,
}: MonthGridProps) {
  const rows = chunkIntoWeeks(days);

  return (
    <div
      role="grid"
      // 주 보기의 radiogroup 과 **같은 이름**이다 — 보기를 바꿔도 "무엇을 고르는 곳인지"는 같다.
      aria-label="날짜 선택"
      onBlur={onBlur}
      className="flex flex-col gap-[var(--cal-gap)] overflow-x-auto overscroll-x-contain md:overflow-x-visible"
    >
      {/* 요일은 여기서 한 번만 나온다 — 칸마다 반복하지 않는다 (R16). */}
      <div role="row" className={ROW_CLASS}>
        {WEEKDAY_LABELS.map((label, index) => (
          <span
            key={label}
            role="columnheader"
            className={cn(
              // 칸 폭·요일 글자 치수는 calendar-layout.md §2 R12 밀도 토큰(DateCell 과 같은 값).
              'w-[var(--cal-cell-w)] shrink-0 text-center text-[length:var(--cal-weekday-text)] leading-none md:leading-normal',
              weekdayColor(index),
            )}
          >
            {label}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div key={row[0]} role="row" className={ROW_CLASS}>
          {row.map((day) => (
            <DateCell
              key={day}
              variant="month"
              date={day}
              isSelected={day === selectedDate}
              isToday={day === today}
              isFocusTarget={day === focusDate}
              isDisabled={!isWithinRange(day)}
              isOutsideMonth={!isSameMonth(day, anchorDate)}
              summary={summaries?.get(day)}
              buttonRef={(element) => {
                onCellRef(day, element);
              }}
              onSelect={onSelect}
              onFocusCell={onFocusCell}
              onKeyDown={onKeyDown}
              onDropTodo={onDropTodo}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
