'use client';

// 스트립 위쪽 줄: ‹ · 월 표시(날짜 점프) · [주/월 보기] · [오늘] · › (date-strip.md §2-A·R4·R5·R6·R11·R14·§5).
//
// `‹`/`›` 는 **보고 있는 단위**를 옮긴다 — 주 보기에서는 ±7일, 월 보기에서는 ±1달(R14). 이름도 함께
// 바뀐다("이전 주" ↔ "이전 달"): 같은 버튼이 보기에 따라 다른 거리를 움직이는데 이름이 하나면
// 스크린리더 사용자는 어디로 가는지 알 수 없다.
import { lazy, Suspense, useRef, useState } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { Chevron } from '@/features/date-strip/components/Chevron';
import { formatMonthLabel, formatShortMonthLabel } from '@/features/date-strip/lib/format';
import type { DateStripView } from '@/features/date-strip/store/date-strip-store';

import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Popover } from '@/components/ui/Popover';

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

      <YearMonthJump
        anchorDate={anchorDate}
        selectedDate={selectedDate}
        today={today}
        onSelect={onSelect}
      />

      {/* 주 · 월 · 오늘을 붙은 한 줄로 둔다(홈 스토리보드 승인안). 현재 보기는 채워진 칸이고
          aria-pressed 로 알린다. 다른 보기 칸의 이름은 "…로 전환" 이다 — 눌러서 그 보기로 간다. */}
      <div className="flex items-center gap-[var(--space-2)]">
        <div
          role="group"
          aria-label="보기와 오늘"
          className="flex overflow-hidden rounded-[var(--radius-md)] border border-border"
        >
          <ViewSegment
            label="주"
            current={!isMonth}
            onSelect={() => {
              if (isMonth) onToggleView();
            }}
          />
          <ViewSegment
            label="월"
            current={isMonth}
            onSelect={() => {
              if (!isMonth) onToggleView();
            }}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label="오늘로 이동"
            disabled={selectedDate === today}
            // 누르는 순간 R5 로 비활성되는 버튼이라 포커스는 항상 오늘 셀이 넘겨받는다.
            onClick={() => onSelect(today, true)}
            className="min-w-[44px] rounded-none border-l border-border"
          >
            오늘
          </Button>
        </div>
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

type ViewSegmentProps = { label: '주' | '월'; current: boolean; onSelect: () => void };

/** 보기 전환 한 칸. 현재 칸은 채워지고(aria-pressed), 다른 칸은 "…보기로 전환" 이라는 이름을 갖는다. */
function ViewSegment({ label, current, onSelect }: ViewSegmentProps) {
  return (
    <Button
      variant={current ? 'primary' : 'ghost'}
      size="sm"
      aria-label={current ? `${label} 보기` : `${label} 보기로 전환`}
      aria-pressed={current}
      onClick={onSelect}
      className={`min-w-[44px] rounded-none ${label === '월' ? 'border-l border-border' : ''}`}
    >
      {label}
    </Button>
  );
}

/** 피커 본문은 지연 로드한다(BackupLauncher 와 같은 lazy() 패턴) — 아래 `YearMonthJump` 머리 주석. */
const LazyYearMonthPicker = lazy(async () => {
  const loaded = await import('@/features/date-strip/components/YearMonthPicker');
  return { default: loaded.YearMonthPicker };
});

/**
 * 월 표시를 누르면 년·월 피커가 열린다(calendar-layout.md §3 R15~R19, T-07 의 네이티브
 * `input[type=date]` 를 교체했다).
 *
 * 피커 본문(`YearMonthPicker`)은 **지연 로드한다** — 자주 열지 않는 화면이라 첫 로드 JS 예산에
 * 상시로 실릴 이유가 없다(calendar-layout.md §7 리스크 — 진입 폐포 여유 1,779 B 뿐이라 정적
 * import 는 예산을 넘긴다). `autoFocus={false}` 인 이유: 지연 로드로 처음 여는 순간엔 패널 안에
 * 포커스할 것이 아직 없고(청크 로딩 중), 청크가 캐시된 다음번부터는 Popover 의 "첫 포커스 가능
 * 요소" 가 이전 해 버튼이 되어 R16(선택된 달의 월 버튼)과 어긋난다 — 초기 포커스는
 * `YearMonthPicker` 자신의 effect 가 전담한다.
 *
 * 열고 닫는 일 자체는 **`Popover` 프리미티브에 맡긴다.** T-07 당시 프리미티브가 없어 여기에
 * 자체 구현(Esc + `blur` 닫기)을 두었는데, `blur` 로 닫으면 (1) 바깥을 눌렀을 때 포커스를
 * 앵커로 되돌릴 수 없고(`mousedown` 기본 동작이 그 뒤에 덮는다 — T-35), (2) 팝오버 **안에서**
 * 포커스가 움직이기만 해도 닫힌다. 둘 다 프리미티브가 이미 푼 문제다(app-shell R7).
 */
function YearMonthJump({
  anchorDate,
  selectedDate,
  today,
  onSelect,
}: Pick<DateStripHeaderProps, 'anchorDate' | 'selectedDate' | 'today' | 'onSelect'>) {
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
      {/* 항상 마운트하고 open 만 토글한다 — 닫혀 있을 때도 앵커에 aria-haspopup 이 붙어야 한다(R17). */}
      <Popover
        open={isOpen}
        onClose={() => setIsOpen(false)}
        anchorRef={anchorRef}
        label="연도와 월 선택"
        autoFocus={false}
        className="w-[280px] rounded-[var(--radius-xl)] p-[var(--space-3)]"
      >
        <Suspense
          fallback={
            // 실제 패널 크기의 자리표시자(리뷰 Minor) — `null` 이면 첫 열림에서 패널 높이가
            // ~26px 로 측정돼 Popover 의 하단 클램프 계산이 틀어진다.
            // 폭은 `w-full` — 이 div 는 `Popover` 의 콘텐츠 상자(`p-[--space-3]`·`border` 안쪽) 를
            // 그대로 채우는 자리이지, 패널 자체가 아니다(R18 의 280px 는 패널 바깥 치수 — 자식이
            // 다시 280px 를 주장하면 패딩·테두리만큼 밖으로 삐져나온다, 아래 `YearMonthPicker`
            // 머리 주석과 같은 계산·같은 사고, 2차 리뷰 Major).
            // 높이 256px = `YearMonthPicker` 실제 내용의 실측 합(2026-09-23, 토큰값 그대로 계산):
            //   년 줄(`IconButton` = --control-hit-min 32) 32
            //   + 세로 gap(--space-3) 12
            //   + [이번 달] 버튼(`Button size="sm"` = --control-hit-min) 32
            //   + 세로 gap(--space-3) 12
            //   + 월 격자 4행(--control-height 36) + 3간(--space-2 8) = 4*36 + 3*8 = 168
            //   = 32 + 12 + 32 + 12 + 168 = 256
            // `aria-busy` 는 콘텐츠가 아직 채워지지 않았음을 알린다 — 시각 언어를 새로 더하지
            // 않으므로 빈 박스로 둔다.
            <div aria-busy="true" className="h-[256px] w-full" />
          }
        >
          <LazyYearMonthPicker
            selectedDate={selectedDate}
            today={today}
            onSelect={(date) => {
              onSelect(date);
              setIsOpen(false);
            }}
          />
        </Suspense>
      </Popover>
    </>
  );
}
