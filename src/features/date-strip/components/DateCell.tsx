'use client';

// 날짜 스트립의 셀 하나 (date-strip.md R3·R6·R7·R8·R9·R11·§5).
import { useState, type CSSProperties, type KeyboardEvent, type Ref } from 'react';

import type { DateKey } from '@/domain/date/date-key';
import type { DaySummary } from '@/domain/todo/day-summary';

import {
  SATURDAY_INDEX,
  SUNDAY_INDEX,
  WEEKDAY_LABELS,
  formatCellName,
  formatDayNumber,
  formatProgressName,
  weekdayIndex,
} from '@/features/date-strip/lib/format';

import { cn } from '@/lib/cn';

/** 드래그 중인 투두 id 를 나르는 MIME 타입 (R13). 드래그를 시작하는 쪽(투두 목록)도 이 값을 쓴다. */
export const TODO_DRAG_MIME = 'application/x-tasky-todo-id';

type DateCellProps = {
  date: DateKey;
  isSelected: boolean;
  isToday: boolean;
  /** roving tabindex 의 현재 진입점인지 (§5). 그룹에서 `tabIndex=0` 인 셀은 하나뿐이다. */
  isFocusTarget: boolean;
  /** 이동 가능 범위(R6) 밖 — 주가 범위 끝을 걸칠 때만 생긴다. */
  isDisabled: boolean;
  /** 아직 못 읽었으면 `undefined` — 점·✓ 없이 셀만 그린다 (§2-C). */
  summary?: DaySummary;
  buttonRef?: Ref<HTMLButtonElement>;
  onSelect: (date: DateKey) => void;
  onFocusCell: (date: DateKey) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  /** 투두를 이 날짜로 옮긴다 (R13). 없으면 드롭 자체를 받지 않는다. */
  onDropTodo?: (todoId: string, date: DateKey) => void;
};

/** 요일 색 (R9). 색은 보조 정보이고 요일 글자가 항상 함께 있다. */
function weekdayColor(index: number): string {
  if (index === SATURDAY_INDEX) return 'text-[var(--color-saturday)]';
  if (index === SUNDAY_INDEX) return 'text-[var(--color-sunday)]';
  return 'text-muted';
}

export function DateCell({
  date,
  isSelected,
  isToday,
  isFocusTarget,
  isDisabled,
  summary,
  buttonRef,
  onSelect,
  onFocusCell,
  onKeyDown,
  onDropTodo,
}: DateCellProps) {
  const [isDropTarget, setIsDropTarget] = useState(false);
  const index = weekdayIndex(date);
  const canDrop = onDropTodo !== undefined && !isDisabled;

  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-label={formatCellName({
        date,
        isToday,
        progress: summary && formatProgressName(summary.total, summary.doneCount),
      })}
      disabled={isDisabled}
      tabIndex={isFocusTarget ? 0 : -1}
      onClick={() => onSelect(date)}
      onFocus={() => onFocusCell(date)}
      onKeyDown={onKeyDown}
      onDragOver={
        canDrop
          ? (event) => {
              event.preventDefault();
              setIsDropTarget(true);
            }
          : undefined
      }
      onDragLeave={canDrop ? () => setIsDropTarget(false) : undefined}
      onDrop={
        canDrop
          ? (event) => {
              event.preventDefault();
              setIsDropTarget(false);
              const todoId = event.dataTransfer.getData(TODO_DRAG_MIME);
              if (todoId !== '') onDropTodo(todoId, date);
            }
          : undefined
      }
      className={cn(
        'flex h-[72px] w-[56px] shrink-0 snap-center flex-col items-center justify-center gap-[var(--space-1)]',
        // 날짜를 바꿀 때 실제로 움직이는 것이 이 색 전환이라, R10 의 120ms 상한이 걸리는 자리도 여기다.
        // 수치는 `--motion-xfast`(theme.md §3-D) 한 곳에만 산다 — `--motion-fast`(150ms)는 상한을 넘는다.
        'rounded-[var(--radius-lg)] motion-safe:transition-colors motion-safe:duration-[var(--motion-xfast)] motion-safe:ease-[var(--motion-ease)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:opacity-40',
        // 선택 = 파스텔 채움 + 중립 잉크 링(theme.md §3-G R17). 라이트에서 파스텔 채움은 배경과
        // 1.14~2.16:1 뿐이라 채움만으로는 WCAG 1.4.11 의 3:1 에 못 미친다 — 3:1 을 지는 것은
        // `--color-selected-ring`(= --color-text) 링이다. 안쪽 링이라 칸 크기가 변하지 않는다.
        // 채움 유틸은 강조색 이름 그대로 둔다: 선택 채움 토큰이 강조색을 가리켜 렌더 결과가 같은데,
        // 이름만 바꾸면 그 클래스 문자열을 재는 테스트 파일들이 깨진다(그 파일들은 T-49 소유다).
        isSelected
          ? 'bg-accent text-on-accent ring-[length:var(--control-selected-ring)] ring-selected-ring ring-inset'
          : 'bg-transparent text-text hover:enabled:bg-surface-2',
        // 오늘이면서 선택이면 강조색 링을 걷어내고 잉크 링만 남긴다 (R3 · theme.md §3-G R20).
        // "오늘"(강조색 링, 채움 없음)과 "선택"(채움 + 잉크 링)은 색도 채움 여부도 달라 겹치지 않는다.
        isToday && !isSelected && 'ring-2 ring-accent ring-inset',
        isDropTarget && 'border-2 border-dashed border-accent',
      )}
    >
      <span
        className={cn(
          'text-xs leading-normal',
          isSelected ? 'text-on-accent' : weekdayColor(index),
        )}
      >
        {WEEKDAY_LABELS[index]}
      </span>
      <span className={cn('text-lg leading-normal', isToday ? 'font-bold' : 'font-semibold')}>
        {formatDayNumber(date)}
      </span>
      <DaySummaryMarks summary={summary} />
    </button>
  );
}

/**
 * 카테고리 색 점과 완료 배지 (R7·R8). 전부 `aria-hidden` — 같은 정보가 셀 접근성 이름에 문장으로 있다(§5).
 * 요약이 늦게 도착하므로 자리는 미리 잡아 두고 채워질 때만 `--motion-xfast` 페이드로 나타난다(R10 의 상한).
 */
function DaySummaryMarks({ summary }: { summary?: DaySummary }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex h-[var(--space-2)] items-center justify-center gap-[3px]',
        'motion-safe:transition-opacity motion-safe:duration-[var(--motion-xfast)] motion-safe:ease-[var(--motion-ease)]',
        summary === undefined ? 'opacity-0' : 'opacity-100',
      )}
    >
      {summary?.dots.map((dot) => (
        <span
          key={dot.categoryId}
          // CSS 사용자 지정 속성은 CSSProperties 에 없어 캐스팅이 필요하다(타입 경계).
          style={{ '--cat-color': dot.color } as CSSProperties}
          className="size-[5px] rounded-[var(--radius-full)] bg-[var(--cat-color)]"
        />
      ))}
      {summary !== undefined && summary.overflowCount > 0 && (
        <span className="text-xs leading-none">+{summary.overflowCount}</span>
      )}
      {summary?.isAllDone === true && <CheckBadge />}
    </span>
  );
}

/** 그날 투두가 1개 이상이고 전부 완료일 때만 (R8). */
function CheckBadge() {
  return (
    <svg viewBox="0 0 12 12" className="size-[10px] shrink-0">
      <path
        d="M2.5 6.5 5 9l4.5-5.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
