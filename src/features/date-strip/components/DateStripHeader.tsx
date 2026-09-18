'use client';

// 스트립 위쪽 줄: ‹ · 월 표시(날짜 점프) · [주/월 보기] · [오늘] · › (date-strip.md §2-A·R4·R5·R6·R11·R14·§5).
//
// `‹`/`›` 는 **보고 있는 단위**를 옮긴다 — 주 보기에서는 ±7일, 월 보기에서는 ±1달(R14). 이름도 함께
// 바뀐다("이전 주" ↔ "이전 달"): 같은 버튼이 보기에 따라 다른 거리를 움직이는데 이름이 하나면
// 스크린리더 사용자는 어디로 가는지 알 수 없다.
import { useRef, useState } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { formatMonthLabel, formatShortMonthLabel } from '@/features/date-strip/lib/format';
import { MAX_DATE_KEY, MIN_DATE_KEY } from '@/features/date-strip/lib/week';
import type { DateStripView } from '@/features/date-strip/store/date-strip-store';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Popover } from '@/components/ui/Popover';

import { isDateKey } from '@/lib/date';

type DateStripHeaderProps = {
  /**
   * 월 표시가 따르는 날짜. 주 보기에서는 **보이는 주의 월요일**이고(주가 달을 걸치면 월요일이 속한
   * 달이 기준이다) 월 보기에서는 보고 있는 달의 날짜다.
   */
  anchorDate: DateKey;
  selectedDate: DateKey;
  today: DateKey;
  /** 지금 보기 (R14). 버튼 이름과 토글 글자가 이것을 따른다. */
  view: DateStripView;
  /** `undefined` 면 그 방향은 범위 끝이라 버튼이 비활성된다 (R6). */
  previousStep?: DateKey;
  nextStep?: DateKey;
  /**
   * `previousStep`/`nextStep` 으로 옮긴 **뒤에** 같은 방향이 또 있는지 (R6). 없으면 방금 누른 버튼이
   * 그 자리에서 비활성되므로 포커스를 셀로 넘겨야 한다 — 거리가 보기마다 달라(7일 ↔ 1달) 여기서
   * 다시 계산하지 않고 호출부가 알려 준다.
   */
  hasStepAfter: (target: DateKey, direction: -1 | 1) => boolean;
  /** 주 ↔ 월 보기를 뒤집는다 (R14). */
  onToggleView: () => void;
  /**
   * 날짜를 선택한다. `adoptFocus` 가 참이면 **이 선택으로 방금 누른 버튼이 비활성된다**는 뜻이고,
   * 호출부는 포커스를 선택 셀로 넘겨야 한다 — 그러지 않으면 포커스가 <body> 로 떨어진다 (WCAG 2.4.3).
   */
  onSelect: (date: DateKey, adoptFocus?: boolean) => void;
};

export function DateStripHeader({
  anchorDate,
  selectedDate,
  today,
  view,
  previousStep,
  nextStep,
  hasStepAfter,
  onToggleView,
  onSelect,
}: DateStripHeaderProps) {
  const isMonth = view === 'month';
  /** 한 칸 이동. 이동한 자리에서 같은 방향이 범위 끝이면 이 버튼이 곧 비활성되므로 포커스를 넘긴다. */
  const step = (target: DateKey | undefined, direction: -1 | 1) => {
    if (target === undefined) return;
    onSelect(target, !hasStepAfter(target, direction));
  };

  return (
    <div className="flex items-center justify-between gap-[var(--space-2)]">
      <IconButton
        label={isMonth ? '이전 달' : '이전 주'}
        disabled={previousStep === undefined}
        onClick={() => step(previousStep, -1)}
      >
        <Chevron direction="left" />
      </IconButton>

      <MonthJump anchorDate={anchorDate} selectedDate={selectedDate} onSelect={onSelect} />

      <div className="flex items-center gap-[var(--space-2)]">
        {/* 글자가 **가려는 곳**을 가리킨다(주 보기에서는 "월 보기"). aria-pressed 를 쓰면 같은 글자가
            눌림 상태에 따라 현재와 목적지를 오가며 뜻이 뒤집혀, 소리로만 듣는 쪽에서 방향이 사라진다. */}
        <Button
          variant="ghost"
          size="sm"
          aria-label={isMonth ? '주 보기로 전환' : '월 보기로 전환'}
          onClick={onToggleView}
        >
          {isMonth ? '주 보기' : '월 보기'}
        </Button>
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
          label={isMonth ? '다음 달' : '다음 주'}
          disabled={nextStep === undefined}
          onClick={() => step(nextStep, 1)}
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
  anchorDate,
  selectedDate,
  onSelect,
}: Pick<DateStripHeaderProps, 'anchorDate' | 'selectedDate' | 'onSelect'>) {
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
        <span className="hidden sm:inline">{formatMonthLabel(anchorDate)}</span>
        <span className="sm:hidden">{formatShortMonthLabel(anchorDate)}</span>
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
