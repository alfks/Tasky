'use client';

// 일 피커의 껍질 — Popover + lazy() + Suspense 자리표시자. 진입 폐포에 남는 것은 이 파일뿐이고
// 본문(`DayPicker`)은 첫 열림에 받는 청크다(calendar-layout.md §3-A·§7). `todo` feature 는 배럴로
// 이것만 가져다 쓴다("날짜 바꾸기…"·편집 패널 날짜 필드, todo.md R10-b·c).
import { lazy, Suspense, type RefObject } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { Popover } from '@/components/ui/Popover';

const LazyDayPicker = lazy(async () => {
  const loaded = await import('@/features/date-strip/components/DayPicker');
  return { default: loaded.DayPicker };
});

type DayPickerPopoverProps = {
  open: boolean;
  /** Esc·바깥 클릭 — 변경 없음. 포커스 복귀는 Popover 가 앵커로 한다. */
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  value: DateKey;
  today: DateKey;
  /** 격자 위 한 줄 안내. 항목 메뉴에서 열 때만 준다. */
  hint?: string;
  placement?: 'bottom-start' | 'bottom-end';
  /** 앵커가 사라진 뒤 닫힐 때의 대체 포커스(app-shell R14). */
  returnFocus?: () => HTMLElement | null;
  /** 칸·[오늘]·[내일] 확정. 닫는 것도 호출 쪽이 한다(값을 어디에 쓸지는 호출부마다 다르다). */
  onPick: (date: DateKey) => void;
};

export function DayPickerPopover({
  open,
  onClose,
  anchorRef,
  value,
  today,
  hint,
  placement = 'bottom-start',
  returnFocus,
  onPick,
}: DayPickerPopoverProps) {
  return (
    // `label` 은 주지 않는다 — 자식 격자가 이미 "날짜 고르기" 라는 이름 있는 역할이라, 주면 같은
    // 이름이 group → grid 로 두 번 낭독된다(Popover 머리주석 M-5). `autoFocus={false}` 인 이유는
    // DateStripHeader 의 YearMonthJump 와 같다 — 초기 포커스는 지연 로드된 본문의 effect 가 맡는다.
    <Popover
      open={open}
      onClose={onClose}
      anchorRef={anchorRef}
      placement={placement}
      autoFocus={false}
      returnFocus={returnFocus}
      className="w-[280px] rounded-[var(--radius-xl)] p-[var(--space-3)]"
    >
      <Suspense
        fallback={
          // 실제 본문 높이의 자리표시자 — `null` 이면 Popover 가 열리는 순간 ~26px 로 재서 하단 클램프가
          // 틀어진다(YearMonthJump 와 같은 사고). 토큰값 그대로 계산(2026-09-29):
          //   달 줄(IconButton = --control-hit-min 32) 32 + gap(--space-3) 12
          //   + 요일 줄(--space-5) 20 + gap(--space-1) 4 + 격자 6줄(6×32 + 5×4, 항상 확보) 212
          //   + gap 12 + [오늘][내일](Button sm = 32) 32 = 324
          //   힌트가 있으면 + 한 줄(--text-xs 12 × leading-normal 1.5 = 18) + gap 12 = 354
          <div
            aria-busy="true"
            className={hint === undefined ? 'h-[324px] w-full' : 'h-[354px] w-full'}
          />
        }
      >
        <LazyDayPicker value={value} today={today} hint={hint} onPick={onPick} />
      </Suspense>
    </Popover>
  );
}
