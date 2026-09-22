'use client';

// 년·월 피커 본문 (calendar-layout.md §3 R15~R19). `DateStripHeader` 가 Popover 안에서
// **지연 로드한다**(BackupLauncher 와 같은 lazy() 패턴, calendar-layout.md §7 리스크 — 번들 예산 여유
// 1,779 B 뿐이라 정적 import 는 예산을 넘긴다). 그래서 초기 포커스(R16)는 Popover 의 autoFocus 가
// 아니라 이 컴포넌트 자신의 effect 가 전담한다 — Popover 가 열리는 순간엔 지연 청크가 아직 없어
// "첫 포커스 가능 요소" 를 찾지 못하고, 청크가 캐시된 다음번 열기부터는 그 "첫 요소" 가 이전 해
// 버튼이 되어 R16(선택된 달의 월 버튼)과 어긋나기 때문이다(DateStripHeader 의 `autoFocus={false}`).
import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import {
  monthLabel,
  moveMonthFocus,
  shiftYear,
  withYearMonth,
  yearMonthOf,
  MAX_YEAR,
  MIN_YEAR,
  type MonthGridMove,
  type YearMonth,
} from '@/features/date-strip/lib/year-month';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';

import { cn } from '@/lib/cn';
import { isImeKey } from '@/lib/ime';

const MONTHS = Array.from({ length: 12 }, (_, index) => index + 1);

/** 방향키 → `moveMonthFocus` 의 이동 이름 (R16). Home/End/PageUp/PageDown 도 여기서 한 번에 잡는다. */
const KEY_MOVE: Partial<Record<string, MonthGridMove>> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  Home: 'home',
  End: 'end',
  PageUp: 'pageUp',
  PageDown: 'pageDown',
};

type YearMonthPickerProps = {
  /** 일(日)을 유지한 채 이동할 기준 날짜(R15) — 처음 보여줄 해·달, "선택된 달" 표시도 여기서 뽑는다. */
  selectedDate: DateKey;
  today: DateKey;
  /** 확정된 날짜 하나. 팝오버를 닫는 것은 호출 쪽 몫이다(R21 — 이동 로직은 select 하나뿐). */
  onSelect: (date: DateKey) => void;
};

/** 한 화면, 두 단계 없음 — 년 스테퍼 줄 + [이번 달] + 3×4 월 격자(R15). */
export function YearMonthPicker({ selectedDate, today, onSelect }: YearMonthPickerProps) {
  const selectedYm = yearMonthOf(selectedDate);
  const todayYm = yearMonthOf(today);
  const [focus, setFocus] = useState<YearMonth>(selectedYm);
  const [fading, setFading] = useState(false);
  const monthRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastYearRef = useRef(focus.year);

  // 열리면 포커스는 선택된 달의 월 버튼(R16) — 마운트 시 한 번뿐이다.
  useEffect(() => {
    monthRefs.current[selectedYm.month - 1]?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 년이 바뀔 때만 월 격자를 opacity 크로스페이드(R19). 12개 버튼은 해가 바뀌어도 다시 만들어지지
  // 않고(그대로 재사용) 라벨·강조만 갱신되므로, 페이드는 시각 효과일 뿐 포커스 이동과는 무관하다.
  useEffect(() => {
    if (lastYearRef.current === focus.year) return;
    lastYearRef.current = focus.year;
    setFading(true);
    const id = requestAnimationFrame(() => setFading(false));
    return () => cancelAnimationFrame(id);
  }, [focus.year]);

  const commit = (target: YearMonth) => onSelect(withYearMonth(selectedDate, target));

  const moveTo = (next: YearMonth) => {
    setFocus(next);
    // 12개 버튼은 해가 바뀌어도 그대로 있으므로(위 주석) 다음 렌더를 기다릴 필요가 없다.
    monthRefs.current[next.month - 1]?.focus();
  };

  const handleKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (isImeKey(event.nativeEvent)) return;
    const move = KEY_MOVE[event.key];
    if (move === undefined) return;
    event.preventDefault();
    moveTo(moveMonthFocus(focus, move));
  };

  const canGoPrevYear = focus.year > MIN_YEAR;
  const canGoNextYear = focus.year < MAX_YEAR;

  return (
    <div className="flex w-[280px] flex-col gap-[var(--space-3)]">
      <div role="group" className="flex items-center justify-between">
        <IconButton
          label="이전 해"
          disabled={!canGoPrevYear}
          onClick={() => setFocus((current) => shiftYear(current, -1))}
        >
          <Chevron direction="left" />
        </IconButton>
        <span aria-live="polite" className="text-xl leading-none font-bold text-text tabular-nums">
          {focus.year}
        </span>
        <IconButton
          label="다음 해"
          disabled={!canGoNextYear}
          onClick={() => setFocus((current) => shiftYear(current, 1))}
        >
          <Chevron direction="right" />
        </IconButton>
      </div>

      <Button variant="ghost" size="sm" className="self-start" onClick={() => commit(todayYm)}>
        이번 달
      </Button>

      <div
        role="radiogroup"
        aria-label="월 선택"
        className={cn(
          'grid grid-cols-3 gap-[var(--space-2)]',
          'motion-safe:transition-opacity motion-safe:duration-[var(--motion-xfast)] motion-safe:ease-[var(--motion-ease)]',
          fading ? 'opacity-0' : 'opacity-100',
        )}
      >
        {MONTHS.map((month) => {
          const isSelectedMonth = focus.year === selectedYm.year && month === selectedYm.month;
          const isCurrentMonth = focus.year === todayYm.year && month === todayYm.month;
          return (
            <button
              key={month}
              ref={(element) => {
                monthRefs.current[month - 1] = element;
              }}
              type="button"
              role="radio"
              aria-checked={isSelectedMonth}
              aria-label={isCurrentMonth ? `${monthLabel(month)}, 이번 달` : monthLabel(month)}
              tabIndex={month === focus.month ? 0 : -1}
              onClick={() => commit({ year: focus.year, month })}
              onFocus={() => setFocus((current) => ({ ...current, month }))}
              onKeyDown={handleKeyDown}
              className={cn(
                'h-[var(--control-height)] rounded-[var(--radius-lg)] text-[length:var(--text-md)] font-semibold',
                'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                // 선택 달 표현은 DateCell 의 선택 표현을 그대로 가져온다(R18, theme.md §3-G R17) —
                // 파스텔 채움만으로는 WCAG 1.4.11 의 3:1 에 못 미치므로 잉크 안쪽 링이 함께 진다.
                isSelectedMonth
                  ? 'bg-accent text-on-accent ring-[length:var(--control-selected-ring)] ring-selected-ring ring-inset forced-colors:[border-width:var(--control-selected-ring)] forced-colors:[border-style:solid]'
                  : 'bg-transparent text-text hover:bg-surface-2',
                // 이번 달 = 오늘 셀과 같은 강조색 링(R3 과 같은 언어). 선택 달과는 겹치지 않는 시각
                // 언어로 두 상태가 같은 칸에서 만나면 채움이 이긴다(DateCell 의 오늘+선택 규칙과 같다).
                isCurrentMonth && !isSelectedMonth && 'ring-2 ring-accent ring-inset',
              )}
            >
              {monthLabel(month)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

const CHEVRON_PATH = { left: 'M10 3 5 8l5 5', right: 'M6 3l5 5-5 5' } as const;

/** 방향 표시 아이콘. 장식이므로 부모 버튼이 이름을 책임진다(DateStripHeader 의 Chevron 과 같은 모양). */
function Chevron({ direction }: { direction: keyof typeof CHEVRON_PATH }) {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-[var(--space-4)] shrink-0">
      <path
        d={CHEVRON_PATH[direction]}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
