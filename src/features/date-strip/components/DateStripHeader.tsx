'use client';

// 스트립 위쪽 줄: ‹ · 월 표시(날짜 점프) · [오늘] · › (date-strip.md §2-A·R4·R5·R6·R11·§5).
import { useRef, useState } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { formatMonthLabel, formatShortMonthLabel } from '@/features/date-strip/lib/format';
import { MAX_DATE_KEY, MIN_DATE_KEY, shiftWithinRange } from '@/features/date-strip/lib/week';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Popover } from '@/components/ui/Popover';

import { isDateKey } from '@/lib/date';

type DateStripHeaderProps = {
  /** 월 표시는 **보이는 주**를 따른다 — 주가 달을 걸치면 월요일이 속한 달이 기준이다. */
  weekStart: DateKey;
  selectedDate: DateKey;
  today: DateKey;
  /** `undefined` 면 그 방향은 범위 끝이라 버튼이 비활성된다 (R6). */
  previousWeek?: DateKey;
  nextWeek?: DateKey;
  /**
   * 날짜를 선택한다. `adoptFocus` 가 참이면 **이 선택으로 방금 누른 버튼이 비활성된다**는 뜻이고,
   * 호출부는 포커스를 선택 셀로 넘겨야 한다 — 그러지 않으면 포커스가 <body> 로 떨어진다 (WCAG 2.4.3).
   */
  onSelect: (date: DateKey, adoptFocus?: boolean) => void;
};

export function DateStripHeader({
  weekStart,
  selectedDate,
  today,
  previousWeek,
  nextWeek,
  onSelect,
}: DateStripHeaderProps) {
  /** 주 이동. 이동한 자리에서 같은 방향이 범위 끝이면 이 버튼이 곧 비활성되므로 포커스를 넘긴다. */
  const stepWeek = (target: DateKey | undefined, days: number) => {
    if (target === undefined) return;
    onSelect(target, shiftWithinRange(target, days) === undefined);
  };

  return (
    <div className="flex items-center justify-between gap-[var(--space-2)]">
      <IconButton
        label="이전 주"
        disabled={previousWeek === undefined}
        onClick={() => stepWeek(previousWeek, -7)}
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
          // 누르는 순간 R5 로 비활성되는 버튼이라 포커스는 항상 오늘 셀이 넘겨받는다.
          onClick={() => onSelect(today, true)}
        >
          오늘
        </Button>
        <IconButton
          label="다음 주"
          disabled={nextWeek === undefined}
          onClick={() => stepWeek(nextWeek, 7)}
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
 *
 * 열고 닫는 일 자체는 **`Popover` 프리미티브에 맡긴다.** T-07 당시 프리미티브가 없어 여기에
 * 자체 구현(Esc + `blur` 닫기)을 두었는데, `blur` 로 닫으면 (1) 바깥을 눌렀을 때 포커스를
 * 앵커로 되돌릴 수 없고(`mousedown` 기본 동작이 그 뒤에 덮는다 — T-35), (2) 팝오버 **안에서**
 * 포커스가 움직이기만 해도 닫힌다. 둘 다 프리미티브가 이미 푼 문제다(app-shell R7).
 */
function MonthJump({
  weekStart,
  selectedDate,
  onSelect,
}: Pick<DateStripHeaderProps, 'weekStart' | 'selectedDate' | 'onSelect'>) {
  const [isOpen, setIsOpen] = useState(false);
  const anchorRef = useRef<HTMLButtonElement>(null);

  return (
    <>
      <Button
        ref={anchorRef}
        variant="ghost"
        size="sm"
        // aria-haspopup·aria-expanded·aria-controls 는 Popover 가 앵커에 직접 붙인다 —
        // 여기서 같이 쓰면 두 벌이 되어 어긋난다.
        onClick={() => setIsOpen((open) => !open)}
      >
        <span className="hidden sm:inline">{formatMonthLabel(weekStart)}</span>
        <span className="sm:hidden">{formatShortMonthLabel(weekStart)}</span>
        <Chevron direction="down" />
      </Button>
      {/* 항상 마운트하고 open 만 토글한다 — 닫혀 있을 때도 앵커에 aria-haspopup 이 붙어야 한다. */}
      <Popover
        open={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        // label 을 주지 않는다: 안에 있는 것이 이름 있는 입력 하나뿐이라, 주면 같은 이름이
        // 버튼 → 그룹 → 입력으로 거듭 낭독된다.
        className="w-fit min-w-0"
      >
        <input
          type="date"
          aria-label="날짜 선택"
          value={selectedDate}
          min={MIN_DATE_KEY}
          max={MAX_DATE_KEY}
          onChange={(event) => {
            const value = event.target.value;
            if (!isDateKey(value)) return;
            onSelect(value);
            setIsOpen(false);
          }}
          className="h-[var(--control-height)] rounded-[var(--radius-sm)] border border-border bg-surface px-[var(--space-2)] text-base text-text"
        />
      </Popover>
    </>
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
