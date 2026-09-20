'use client';

import { useState } from 'react';

import type { DateKey } from '@/domain/date/date-key';

import { formatHeatmapDate } from '@/features/reports/lib/format';
import type { HeatmapCell } from '@/features/reports/lib/period-summary';

import { cn } from '@/lib/cn';

/** T-84 의 5단계 토큰(theme.md §3-H). HEX 를 직접 쓰지 않는다(theme.md R1). */
const LEVEL_VAR: Record<HeatmapCell['level'], string> = {
  0: 'var(--color-heatmap-0)',
  1: 'var(--color-heatmap-1)',
  2: 'var(--color-heatmap-2)',
  3: 'var(--color-heatmap-3)',
  4: 'var(--color-heatmap-4)',
};

/**
 * 고대비(Windows forced-colors) 모드에서 칸 **하나하나가 격자로 보이게** 하는 균일한 테두리
 * (`DateCell`·`CommandPaletteList` 와 같은 처방 — `forced-colors:` 에서는 색을 지정하지 않고
 * 테두리만 그으면 UA 가 시스템 색을 알아서 입힌다).
 *
 * **5단계 전부에 같은 굵기를 쓴다 — 레벨별로 굵기를 다르게 하지 않는다.** theme.md R27 은
 * "칸에 forced-colors 전용 무늬·텍스트를 새로 그려 5단계를 표현하지 않는다"고 이미 못박았다
 * (그 정보는 대체 `table` 채널이 낸다). 여기서 굵기를 맡는 문제는 그것과 다르다 — 강제 색
 * 모드는 `background-color` 5단계를 전부 `Canvas` 하나로 뭉개므로, 테두리조차 없으면 칸
 * **전체가 페이지 배경과 구분되지 않는 빈 상자**가 된다(격자의 존재 자체가 안 보임).
 * 그래서 "기록 없음"(0단계)을 포함한 **모든 칸**에 같은 1px 테두리를 준다 — 데이터 5단계를
 * 다시 인코딩하는 것이 아니라, 격자라는 도형 자체를 보이게 하는 것이다.
 */
const FORCED_COLORS_CELL_BORDER =
  'forced-colors:[border-style:solid] forced-colors:[border-width:1px]';

/** 칸 하나의 완료 정도 문구(review m6) — 버킷 이름 대신 실제 수치. `CategoryRatioCard.
 * aria-valuetext`("N개 중 M개 완료")와 같은 패턴이다. */
function cellStatText(cell: HeatmapCell): string {
  if (cell.total === 0) return '기록 없음';
  return `${cell.total}개 중 ${cell.doneCount}개 완료`;
}

function cellLabel(cell: HeatmapCell): string {
  return `${formatHeatmapDate(cell.date)}, ${cellStatText(cell)}`;
}

/** 격자 전체의 `role=img` 요약(review m5) — "최근 12주 활동 히트맵" 뿐이던 라벨에 평균 달성률을 더한다. */
function averageRatio(cells: readonly HeatmapCell[]): number | null {
  const withRecord = cells.filter((cell) => cell.total > 0);
  if (withRecord.length === 0) return null;
  const sum = withRecord.reduce((acc, cell) => acc + cell.doneCount / cell.total, 0);
  return sum / withRecord.length;
}

function gridSummaryLabel(cells: readonly HeatmapCell[]): string {
  const average = averageRatio(cells);
  if (average === null) return '최근 12주 활동 히트맵, 기록 없음';
  return `최근 12주 활동 히트맵, 평균 달성률 ${Math.round(average * 100)}퍼센트`;
}

type HeatmapCardProps = {
  /** `weeks[i][j]` — i=주(오래된 순), j=요일(월~일). */
  weeks: readonly HeatmapCell[][];
  today: DateKey;
};

/**
 * 활동 히트맵(stats.md R6, 최근 12주). 오늘 이후 칸은 렌더하지 않는다. `role="img"` + 대체 표(§5).
 *
 * 이 카드는 선택한 기간과 무관하게 **항상 최근 12주**를 보여준다(R6) — 그래서 빈 상태 문구도
 * "이 기간에"가 아니라 "최근 12주 동안"이다(review n6, StreakCard 의 M1 수정과 같은 이유).
 */
export function HeatmapCard({ weeks, today }: HeatmapCardProps) {
  const flatCells = weeks.flat().filter((cell) => cell.date <= today);
  const [activeCell, setActiveCell] = useState<HeatmapCell | null>(null);

  if (flatCells.every((cell) => cell.total === 0)) {
    return <p className="text-sm text-muted">최근 12주 동안 기록이 없어요</p>;
  }

  return (
    <div>
      {/*
        카드 상단 수치 읽기(review m6·m16) — 마우스로 1초 가까이 가만히 대야 나오는 네이티브
        `title` 말풍선 하나에만 기대지 않는다. 칸이 버튼이라 포커스만으로도(키보드·터치·확대
        사용자 전부) 여기 문구가 바뀐다. 화면판독기는 이미 아래 sr-only 표로 같은 정보를 읽으므로
        여기는 시각 전용 채널이라 `aria-hidden`이다(중복 낭독 방지).
      */}
      <p aria-hidden="true" className="mb-[var(--space-1)] text-xs text-muted">
        {activeCell ? cellLabel(activeCell) : gridSummaryLabel(flatCells)}
      </p>
      {/*
        theme.md §3-H R25 의 대비 실측은 세 면(bg·surface·surface-2) 마다 값이 다르고, 검증
        리뷰 실측: 다크 0단계(기록 없음)가 surface 기준 1.16(보임)인데 surface-2 기준 1.03(사실상
        사라짐)이다. R26 은 "카드에서 보여야" 만 보장할 뿐 히트맵이 어느 면 위에 놓이는지는 정하지
        않는다(theme.md §3-H). 그래서 **여기서 직접** `--color-surface` 를 선언한다 — `ReportsCard`
        가 지금 `bg-surface` 라 사실상 같은 면이지만, 그 우연에 기대지 않는다(다른 카드 안에
        중첩되거나 `ReportsCard` 의 배경이 바뀌어도 히트맵은 항상 자기 배경을 스스로 정한다).
      */}
      <div
        role="img"
        aria-label={gridSummaryLabel(flatCells)}
        className="grid grid-flow-col gap-[var(--space-1)] rounded-[var(--radius-md)] bg-surface p-[var(--space-1)]"
      >
        {weeks.map((week) => (
          <div key={week[0]?.date} className="flex flex-col gap-[var(--space-1)]">
            {week.map((cell) =>
              cell.date > today ? (
                <div key={cell.date} aria-hidden="true" className="h-[10px] w-[10px]" />
              ) : (
                // 화면판독기의 1차 채널은 아래 sr-only 표다(role=img 안의 인터랙티브 자손은 AT
                // 가상 커서에서 일관되게 읽히지 않는다) — 이 버튼의 aria-label 은 Tab 으로 실제
                // 도달했을 때를 위한 보조 채널이다(중복이지 무의미하지 않다). 목적은 포커스만으로
                // 위 카드 상단 수치가 바뀌는 것(review m6·m16, 마우스 hover 전용이던 것을 대체).
                <button
                  key={cell.date}
                  type="button"
                  aria-label={cellLabel(cell)}
                  onMouseEnter={() => setActiveCell(cell)}
                  onMouseLeave={() => setActiveCell(null)}
                  onFocus={() => setActiveCell(cell)}
                  onBlur={() => setActiveCell(null)}
                  className={cn(
                    'h-[10px] w-[10px] rounded-[2px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
                    FORCED_COLORS_CELL_BORDER,
                  )}
                  style={{ backgroundColor: LEVEL_VAR[cell.level] }}
                />
              ),
            )}
          </div>
        ))}
      </div>
      {/* 범례(review m15) — 훑어보는 사람이 진한 칸이 몇 %인지 짐작이라도 하게. 새 토큰을 만들지
          않고 `--color-heatmap-*` 5단계를 그대로 스와치로 쓴다. 장식이라 aria-hidden. */}
      <div
        aria-hidden="true"
        className="mt-[var(--space-1)] flex items-center gap-[var(--space-1)] text-[10px] text-muted"
      >
        <span>적음</span>
        {([0, 1, 2, 3, 4] as const).map((level) => (
          <span
            key={level}
            className="h-[8px] w-[8px] rounded-[2px]"
            style={{ backgroundColor: LEVEL_VAR[level] }}
          />
        ))}
        <span>많음</span>
      </div>
      <table className="sr-only">
        <caption>날짜별 활동</caption>
        <thead>
          <tr>
            <th scope="col">날짜</th>
            <th scope="col">완료 정도</th>
          </tr>
        </thead>
        <tbody>
          {flatCells.map((cell) => (
            <tr key={cell.date}>
              <th scope="row">{formatHeatmapDate(cell.date)}</th>
              <td>{cellStatText(cell)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
