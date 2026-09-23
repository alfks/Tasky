'use client';

// 날짜 스트립의 셀 하나 (date-strip.md R3·R6·R7·R8·R9·R11·R16·§5).
//
// **주 보기와 월 보기가 같은 셀을 쓴다**(R16). 오늘 링·선택 채움·잉크 링·카테고리 점·✓ 배지·드롭
// 강조는 전부 여기 한 곳에만 있고, 보기별로 다른 것은 `variant` 가 가르는 세 가지뿐이다:
//   1. 노출 역할 — 주 보기는 `radiogroup` 안의 `radio`, 월 보기는 `grid` 안의 `gridcell`.
//      격자 안에 `radio` 를 넣으면 행/열 구조가 보조기술에 전달되지 않고, 반대로 한 줄짜리
//      스트립을 격자로 부르면 없는 행이 읽힌다. 상태 속성도 역할을 따라간다(`aria-checked` ↔ `aria-selected`).
//   2. 요일 글자 — 월 보기는 격자 맨 위 `columnheader` 줄이 한 번만 보여 준다(칸마다 반복하지 않는다).
//      접근성 이름에는 두 보기 모두 요일이 들어간다(`formatCellName`) — 눈으로 훑는 것과 달리
//      스크린리더는 열 위치를 볼 수 없기 때문이다.
//   3. 높이 — 요일 줄이 빠진 만큼(한 줄) 월 보기 칸이 낮다. 폭·라운드·간격은 같다.
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

/** 셀이 놓이는 자리 (R16). `week` = 한 줄 스트립, `month` = 달력 격자. */
export type DateCellVariant = 'week' | 'month';

type DateCellProps = {
  date: DateKey;
  isSelected: boolean;
  isToday: boolean;
  /** roving tabindex 의 현재 진입점인지 (§5). 그룹에서 `tabIndex=0` 인 셀은 하나뿐이다. */
  isFocusTarget: boolean;
  /** 이동 가능 범위(R6) 밖 — 주가 범위 끝을 걸칠 때만 생긴다. */
  isDisabled: boolean;
  /** 어느 보기의 칸인지 (R16). 기본은 주 보기다. */
  variant?: DateCellVariant;
  /** 월 보기 격자에서 **보고 있는 달 밖**의 날짜인지 (R16). 누를 수는 있고 숫자만 흐려진다. */
  isOutsideMonth?: boolean;
  /** 아직 못 읽었으면 `undefined` — 점·✓ 없이 셀만 그린다 (§2-C). */
  summary?: DaySummary;
  buttonRef?: Ref<HTMLButtonElement>;
  onSelect: (date: DateKey) => void;
  onFocusCell: (date: DateKey) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
  /** 투두를 이 날짜로 옮긴다 (R13). 없으면 드롭 자체를 받지 않는다. */
  onDropTodo?: (todoId: string, date: DateKey) => void;
};

/**
 * 요일 색 (R9). 색은 보조 정보이고 요일 글자가 항상 함께 있다.
 *
 * 월 보기의 `columnheader` 줄도 이것을 쓴다 — 토·일 색이 두 보기에서 갈리면 같은 화면에서
 * 토요일이 보기마다 다른 색이 된다.
 */
export function weekdayColor(index: number): string {
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
  variant = 'week',
  isOutsideMonth = false,
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
  const isMonth = variant === 'month';

  return (
    <button
      ref={buttonRef}
      type="button"
      // 역할과 선택 상태는 한 쌍이다 — `gridcell` 은 `aria-checked` 를 지원하지 않고
      // `radio` 는 `aria-selected` 를 지원하지 않는다. 둘을 함께 뒤집는다 (R16).
      role={isMonth ? 'gridcell' : 'radio'}
      aria-checked={isMonth ? undefined : isSelected}
      aria-selected={isMonth ? isSelected : undefined}
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
        'flex w-[var(--cal-cell-w)] shrink-0 snap-center flex-col items-center justify-center gap-[var(--space-1)]',
        // 요일 글자 한 줄이 빠지는 만큼 월 보기 칸이 낮다 (R16). 치수는 calendar-layout.md §2 R12
        // 밀도 토큰 — px 리터럴은 여기 없고 <768 갈래는 tokens.css 미디어 쿼리가 진다.
        isMonth ? 'h-[var(--cal-cell-h-month)]' : 'h-[var(--cal-cell-h-week)]',
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
        // 강제 색 모드(Windows 고대비 등)에서는 UA 가 `box-shadow` 를 통째로 `none` 으로 만든다 —
        // 링만 쓰면 선택 표시가 **완전히 사라진다**(실측: 일곱 칸 어디에도 표시가 없었다).
        // 그때만 같은 굵기의 **테두리**로 갈아 단다. 스와치가 이미 테두리를 써서 살아남는
        // 쪽이라 표현도 그쪽에 맞춘다. `outline` 이 아니라 테두리인 이유는 이 칸이 **포커스를
        // 받기 때문**이다 — 빌드된 CSS 에서 `forced-colors:` 규칙이 `focus-visible:` 보다 뒤에
        // 나와, 윤곽선으로 달면 선택된 칸에서 포커스 링을 덮어써 포커스가 들어와도 화면이
        // 아무 변화가 없다(실측). 테두리는 `box-sizing: border-box` 라 칸 크기를 바꾸지 않는다.
        // 색은 지정하지 않는다 — 강제 색 모드는 어차피 시스템 색으로 덮어쓴다.
        isSelected
          ? 'bg-accent text-on-accent ring-[length:var(--control-selected-ring)] ring-selected-ring ring-inset forced-colors:[border-width:var(--control-selected-ring)] forced-colors:[border-style:solid]'
          : 'bg-transparent text-text hover:enabled:bg-surface-2',
        // 오늘이면서 선택이면 강조색 링을 걷어내고 잉크 링만 남긴다 (R3 · theme.md §3-G R20).
        // "오늘"(강조색 링, 채움 없음)과 "선택"(채움 + 잉크 링)은 색도 채움 여부도 달라 겹치지 않는다.
        // 강제 색 모드에서는 `ring`(box-shadow)이 통째로 사라져 "오늘" 표시가 안 보인다(리뷰 Nit —
        // 새 회귀는 아니다, 위 `isSelected` 분기와 같은 상태였다). 같은 방식으로 테두리를 대체
        // 표현으로 둔다 — `outline` 이 아니라 `border` 인 이유는 위 주석과 같다(포커스 outline 과
        // 겹치지 않아야 한다).
        isToday &&
          !isSelected &&
          'ring-2 ring-accent ring-inset forced-colors:[border-width:var(--control-selected-ring)] forced-colors:[border-style:solid]',
        isDropTarget && 'border-2 border-dashed border-accent',
      )}
    >
      {/* 월 보기는 격자 맨 위 columnheader 줄이 요일을 한 번만 보여 준다 (R16). */}
      {!isMonth && (
        <span
          className={cn(
            // calendar-layout.md §2 R12: <768 은 leading-none(요일 줄을 한 톨 더 조인다).
            'text-[length:var(--cal-weekday-text)] leading-none md:leading-normal',
            isSelected ? 'text-on-accent' : weekdayColor(index),
          )}
        >
          {WEEKDAY_LABELS[index]}
        </span>
      )}
      <span
        className={cn(
          'text-[length:var(--cal-day-text)] leading-normal',
          isToday ? 'font-bold' : 'font-semibold',
          // 이 달 밖 날짜는 숫자만 보조 색으로 물린다 — 투명도로 흐리면 대비가 예측 불가능해지고
          // 점·✓ 까지 같이 흐려져 "할 일이 적은 날"처럼 보인다 (R16).
          isOutsideMonth && !isSelected && 'text-muted',
        )}
      >
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
