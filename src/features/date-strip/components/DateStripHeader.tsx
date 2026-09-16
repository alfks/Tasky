'use client';

// 스트립 위쪽 줄: ‹ · 월 표시(날짜 점프) · [오늘] · › (date-strip.md §2-A·R4·R5·R6·R11·§5).
import { useEffect, useRef, useState, type FocusEvent, type KeyboardEvent } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { formatMonthLabel, formatShortMonthLabel } from '@/features/date-strip/lib/format';
import { MAX_DATE_KEY, MIN_DATE_KEY } from '@/features/date-strip/lib/week';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';

import { isDateKey } from '@/lib/date';

type DateStripHeaderProps = {
  /** 월 표시는 **보이는 주**를 따른다 — 주가 달을 걸치면 월요일이 속한 달이 기준이다. */
  weekStart: DateKey;
  selectedDate: DateKey;
  today: DateKey;
  /** `undefined` 면 그 방향은 범위 끝이라 버튼이 비활성된다 (R6). */
  previousWeek?: DateKey;
  nextWeek?: DateKey;
  onSelect: (date: DateKey) => void;
};

export function DateStripHeader({
  weekStart,
  selectedDate,
  today,
  previousWeek,
  nextWeek,
  onSelect,
}: DateStripHeaderProps) {
  return (
    <div className="flex items-center justify-between gap-[var(--space-2)]">
      <IconButton
        label="이전 주"
        disabled={previousWeek === undefined}
        onClick={() => previousWeek !== undefined && onSelect(previousWeek)}
      >
        <Chevron direction="left" />
      </IconButton>

      <MonthJump weekStart={weekStart} selectedDate={selectedDate} onSelect={onSelect} />

      <div className="flex items-center gap-[var(--space-2)]">
        <Button
          variant="outline"
          size="sm"
          aria-label="오늘로 이동"
          disabled={selectedDate === today}
          onClick={() => onSelect(today)}
        >
          오늘
        </Button>
        <IconButton
          label="다음 주"
          disabled={nextWeek === undefined}
          onClick={() => nextWeek !== undefined && onSelect(nextWeek)}
        >
          <Chevron direction="right" />
        </IconButton>
      </div>
    </div>
  );
}

/**
 * 월 표시를 누르면 네이티브 날짜 입력이 열린다 (§2-A).
 *
 * `input[type=date]` 을 쓰므로 한글 IME 조합이 끼어들 여지가 없고(텍스트 입력이 아니다) 확정은
 * `change` 로만 받는다 — Enter 키를 직접 해석하지 않으므로 조합 중 Enter 오작동 경로가 없다.
 * T-07 의 Popover 프리미티브가 아직 없어 여기서 최소 구현(Esc 닫기 + 포커스 복귀)만 둔다.
 */
function MonthJump({
  weekStart,
  selectedDate,
  onSelect,
}: Pick<DateStripHeaderProps, 'weekStart' | 'selectedDate' | 'onSelect'>) {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const close = (returnFocus: boolean) => {
    setIsOpen(false);
    if (returnFocus) anchorRef.current?.focus();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Escape') return;
    event.stopPropagation();
    close(true);
  };

  // 팝오버 안에서 포커스를 받을 수 있는 요소는 이 입력 하나뿐이라, 입력의 blur 가 곧 "팝오버를 떠남"이다.
  // (래퍼 div 에 onBlur 를 두면 상호작용 핸들러가 붙은 비대화형 요소가 되어 접근성 린트가 막는다.)
  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    if (event.relatedTarget === anchorRef.current) return;
    close(false);
  };

  return (
    <div className="relative">
      <Button
        ref={anchorRef}
        variant="ghost"
        size="sm"
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="hidden sm:inline">{formatMonthLabel(weekStart)}</span>
        <span className="sm:hidden">{formatShortMonthLabel(weekStart)}</span>
        <Chevron direction="down" />
      </Button>
      {isOpen && (
        <div
          className="absolute top-full left-0 z-[var(--z-popover)] mt-[var(--space-1)] rounded-[var(--radius-md)] border border-border bg-surface p-[var(--space-2)] shadow-md"
          // 네이티브 입력 하나뿐이라 대화상자 역할은 두지 않는다 — 포커스 트랩 없이 Esc·blur 로 닫힌다.
        >
          <input
            ref={inputRef}
            type="date"
            aria-label="날짜 선택"
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            value={selectedDate}
            min={MIN_DATE_KEY}
            max={MAX_DATE_KEY}
            onChange={(event) => {
              const value = event.target.value;
              if (!isDateKey(value)) return;
              onSelect(value);
              close(true);
            }}
            className="h-[var(--control-height)] rounded-[var(--radius-sm)] border border-border bg-surface px-[var(--space-2)] text-base text-text"
          />
        </div>
      )}
    </div>
  );
}

const CHEVRON_PATH = {
  left: 'M10 3 5 8l5 5',
  right: 'M6 3l5 5-5 5',
  down: 'M3 6l5 5 5-5',
} as const;

/** 방향 표시 아이콘. 장식이므로 부모 버튼이 이름을 책임진다. */
function Chevron({ direction }: { direction: keyof typeof CHEVRON_PATH }) {
  const path = CHEVRON_PATH[direction];
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[var(--space-4)] shrink-0">
      <path
        d={path}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
