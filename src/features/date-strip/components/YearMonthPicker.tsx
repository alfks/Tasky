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

/**
 * 년 텍스트 `aria-live` 낭독 디바운스(리뷰 Minor). `이전 해`/`다음 해` 연타나 PageUp/PageDown
 * 연속 입력마다 라이브 영역이 갱신되면 `polite` 큐가 밀려, 이미 2027년에 가 있는데 스크린리더가
 * 2020~2027 을 순서대로 계속 읽는 사고가 난다 — **시각 표시는 즉시** 바뀌고 낭독용 노드만 늦춘다.
 *
 * `src/features/stats/hooks/useCompletionPulse.ts#useCompletionAnnouncement` 가 같은 300ms
 * 디바운스를 이미 구현해 뒀지만(grep 으로 확인함) feature 간 공용 React 훅의 자리가 없어
 * (`src/features/AGENTS.md` 규칙 5-(4) — 복제 금지·에스컬레이션 대상) 가져다 쓸 수 없다. React
 * 내장 훅만 쓰는 8줄짜리 범용 디바운스라 도메인 규칙 복제가 아니라고 보고 여기서 다시 짠다 —
 * 값이 갈릴 여지가 있는 것은 300ms 상수뿐이고, 그마저 같은 값으로 맞춰 뒀다.
 */
const ANNOUNCE_DEBOUNCE_MS = 300;

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
  const [announcedYear, setAnnouncedYear] = useState(focus.year);
  const monthRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastYearRef = useRef(focus.year);

  // 낭독용 년 텍스트만 300ms 디바운스한다(위 ANNOUNCE_DEBOUNCE_MS 주석) — 시각 텍스트(`focus.year`)는
  // 그대로 즉시 갱신된다.
  useEffect(() => {
    const timer = window.setTimeout(() => setAnnouncedYear(focus.year), ANNOUNCE_DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [focus.year]);

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
    // `w-[280px]` 를 여기 두지 않는다(리뷰 Major) — 패널 폭 280px(R18)은 이 컴포넌트를 감싸는
    // `Popover` 의 바깥 치수다. `Popover` 는 `border-box` 라 패널의 콘텐츠 상자는
    // 280 − padding(--space-3 12px)×2 − border(1px)×2 = 254px 뿐이고, 이 자식이 또 280px 를
    // 주장하면 254px 상자 밖으로 26px 삐져나온다. 부모가 이미 정한 폭을 그대로 채우면 된다.
    <div className="flex w-full flex-col gap-[var(--space-3)]">
      <div role="group" className="flex items-center justify-between">
        <IconButton
          label="이전 해"
          // 최종 리뷰 Nit: 경계(MIN_YEAR)에서 네이티브 `disabled` 를 쓰면 "방금 누른 그 버튼"이
          // 클릭 직후 접근 트리에서 사라져 포커스가 body 로 떨어진다 — 키보드 사용자가 위치를
          // 잃는다. `aria-disabled` + 클릭 no-op 으로 바꿔 버튼은 계속 포커스 가능한 채로 두고,
          // 시각 비활성은 새 색을 만들지 않고 기존 `disabled:opacity-50`/`disabled:cursor-not-allowed`
          // 와 같은 값을 그대로 일반 유틸로(가짜 pseudo 없이) 적용한다. `pointer-events-none` 은
          // 마우스 hover 도 함께 죽여 `hover:enabled:` 잔상(진짜로는 비활성인데 hover 배경이 켜지는
          // 것)을 막는다 — 키보드 Enter/Space 는 pointer-events 의 영향을 받지 않으므로 onClick
          // 쪽 가드가 그 경로를 막는다. 테스트: YearMonthPicker.test.tsx
          // "범위 끝에서 년 스테퍼가 aria-disabled 다 — 포커스를 유지한다".
          aria-disabled={!canGoPrevYear}
          className={cn(!canGoPrevYear && 'pointer-events-none cursor-not-allowed opacity-50')}
          onClick={() => {
            if (!canGoPrevYear) return;
            setFocus((current) => shiftYear(current, -1));
          }}
        >
          <Chevron direction="left" />
        </IconButton>
        {/* 스크린리더 가상 커서로 훑을 때 이 값이 sr-only 노드와 나란히 두 번 읽히지 않도록
            시각 스팬은 접근 트리에서 뺀다(리뷰 Minor) — 접근 가능한 텍스트는 아래 sr-only
            노드 하나뿐이다. */}
        <span aria-hidden="true" className="text-xl leading-none font-bold text-text tabular-nums">
          {focus.year}
        </span>
        {/* 화면에 보이는 년 숫자와 달리 이 노드만 디바운스된 값을 낭독한다(ANNOUNCE_DEBOUNCE_MS). */}
        <span aria-live="polite" className="sr-only">
          {announcedYear}
        </span>
        <IconButton
          label="다음 해"
          aria-disabled={!canGoNextYear}
          className={cn(!canGoNextYear && 'pointer-events-none cursor-not-allowed opacity-50')}
          onClick={() => {
            if (!canGoNextYear) return;
            setFocus((current) => shiftYear(current, 1));
          }}
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
          // reduced-motion 에서는 `opacity-0` 자체를 `motion-safe:` 로 가둔다 — transition 이 꺼진
          // 채로 opacity 만 0→100 으로 튀면 페이드가 아니라 깜빡임이 된다(R19 "reduced-motion 0ms"
          // 위반). `motion-safe:opacity-0` 는 reduced-motion 에서 아예 매치되지 않아 값이 그대로
          // 100 에 머문다 — JS 로 감속 설정을 따로 읽을 필요가 없다.
          fading ? 'motion-safe:opacity-0' : 'opacity-100',
        )}
      >
        {MONTHS.map((month) => {
          // [2차 리뷰로 되돌림] 1차 리뷰는 "다른 해에서 12개 라디오가 전부 checked=false" 를
          // Minor 로 지적해, 그 자리를 roving tabindex 의 진입점(`focus.month`)으로 채웠었다.
          // 2차 리뷰는 그 수정이 **더 나쁘다**고 봤다 — 화살표로 훑기만 해도(확정 전인데)
          // checked 와 강조 채움이 따라가, 이 위젯이 "포커스"와 "선택"이라는 서로 다른 두 의미를
          // 하나의 시각·청각 신호로 뭉뚱그려 버렸다(같은 해에서는 안 그러다가 해가 바뀌면 그러니
          // 위젯 하나가 두 가지 규칙을 갖는 셈이기도 했다). ARIA Authoring Practices 의
          // radiogroup 패턴은 "선택된 라디오가 없는" 상태를 허용한다(그룹이 아직 아무것도
          // 대표하지 않는 경우) — 그래서 되돌린다: checked·강조 채움은 **실제 선택**(selectedYm)
          // 하고만 일치할 때만 켠다. 다른 해를 보는 동안은 열두 달 전부 unchecked·무채움이고,
          // 그것이 "아직 이 해에서 아무것도 선택하지 않았다"는 사실과 맞다. 키보드 roving 은
          // 이 값과 무관하게 `tabIndex`(아래)로 계속 `focus.month` 를 따라간다 — 포커스 이동과
          // 선택 표시를 이렇게 분리했다(테스트: YearMonthPicker.test.tsx
          // "다른 해에서는 포커스가 옮겨도 checked·강조가 바뀌지 않는다").
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
                // 강제 색 모드에서는 `ring`(box-shadow) 이 통째로 사라진다(리뷰 Nit — DateCell 의
                // "오늘(선택 아님)" 링도 같은 상태였다, 새 회귀는 아니다) — 선택 달과 같은 방식으로
                // 같은 굵기의 테두리를 대체 표현으로 둔다. `outline` 이 아니라 `border` 인 이유도
                // 같다: 이 버튼은 포커스를 받고, `focus-visible` 의 outline 을 forced-colors 규칙이
                // 덮어쓰지 않게 서로 다른 속성을 쓴다.
                isCurrentMonth &&
                  !isSelectedMonth &&
                  'ring-2 ring-accent ring-inset forced-colors:[border-width:var(--control-selected-ring)] forced-colors:[border-style:solid]',
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
