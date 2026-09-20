'use client';

import type { DateKey } from '@/domain/date/date-key';

import { formatHeatmapDate } from '@/features/reports/lib/format';
import type { HeatmapCell } from '@/features/reports/lib/period-summary';

/** T-84 의 5단계 토큰(theme.md §3-H). HEX 를 직접 쓰지 않는다(theme.md R1). */
const LEVEL_VAR: Record<HeatmapCell['level'], string> = {
  0: 'var(--color-heatmap-0)',
  1: 'var(--color-heatmap-1)',
  2: 'var(--color-heatmap-2)',
  3: 'var(--color-heatmap-3)',
  4: 'var(--color-heatmap-4)',
};

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
      <div
        role="img"
        aria-label="최근 12주 활동 히트맵"
        className="grid grid-flow-col gap-[var(--space-1)]"
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
                  className="h-[10px] w-[10px] rounded-[2px]"
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
