'use client';

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

const LEVEL_TEXT: Record<HeatmapCell['level'], string> = {
  0: '기록 없음',
  1: '완료 0%',
  2: '완료 1~49%',
  3: '완료 50~99%',
  4: '완료 100%',
};

function cellLabel(cell: HeatmapCell): string {
  return `${formatHeatmapDate(cell.date)}, ${LEVEL_TEXT[cell.level]}`;
}

type HeatmapCardProps = {
  /** `weeks[i][j]` — i=주(오래된 순), j=요일(월~일). */
  weeks: readonly HeatmapCell[][];
  today: DateKey;
};

/**
 * 활동 히트맵(stats.md R6, 최근 12주). 오늘 이후 칸은 렌더하지 않는다. `role="img"` + 대체 표(§5).
 */
export function HeatmapCard({ weeks, today }: HeatmapCardProps) {
  const flatCells = weeks.flat().filter((cell) => cell.date <= today);
  if (flatCells.every((cell) => cell.total === 0)) {
    return <p className="text-sm text-muted">이 기간에 기록이 없어요</p>;
  }

  return (
    <div>
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
        aria-label="최근 12주 활동 히트맵"
        className="grid grid-flow-col gap-[var(--space-1)] rounded-[var(--radius-md)] bg-surface p-[var(--space-1)]"
      >
        {weeks.map((week) => (
          <div key={week[0]?.date} className="flex flex-col gap-[var(--space-1)]">
            {week.map((cell) =>
              cell.date > today ? (
                <div key={cell.date} aria-hidden="true" className="h-[10px] w-[10px]" />
              ) : (
                <div
                  key={cell.date}
                  aria-hidden="true"
                  title={cellLabel(cell)}
                  className={cn('h-[10px] w-[10px] rounded-[2px]', FORCED_COLORS_CELL_BORDER)}
                  style={{ backgroundColor: LEVEL_VAR[cell.level] }}
                />
              ),
            )}
          </div>
        ))}
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
              <td>{LEVEL_TEXT[cell.level]}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
