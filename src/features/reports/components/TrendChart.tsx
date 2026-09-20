'use client';

import { formatHeatmapDate } from '@/features/reports/lib/format';
import type { TrendPoint } from '@/features/reports/lib/period-summary';

/** 요일 라벨(월~일). 막대 아래 장식(aria-hidden) — 실제 정보는 대체 표가 낸다. */
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function weekdayOf(dateKey: string): string {
  return WEEKDAY_LABELS[new Date(`${dateKey}T00:00:00`).getDay()] ?? '';
}

function averageRatio(points: readonly TrendPoint[]): number | null {
  const ratios = points.flatMap((p) => (p.ratio === null ? [] : [p.ratio]));
  if (ratios.length === 0) return null;
  return ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length;
}

type TrendChartProps = {
  points: readonly TrendPoint[];
};

/**
 * 달성률 추이 막대(stats.md R2). `summarizeDays` 의 날짜별 비율을 그대로 그린다 — 새 계산 없음.
 * `role="img"` + 요약 라벨, 칸 단위 상세는 시각적으로 숨긴 대체 표로 낸다(§5).
 */
export function TrendChart({ points }: TrendChartProps) {
  if (points.every((p) => p.ratio === null)) {
    return <p className="text-sm text-muted">이 기간에 기록이 없어요</p>;
  }

  const average = averageRatio(points);
  const summaryLabel =
    average === null
      ? '기록 없음'
      : `최근 ${points.length}일 평균 달성률 ${Math.round(average * 100)}퍼센트`;

  return (
    <div>
      <div
        role="img"
        aria-label={summaryLabel}
        className="flex h-[80px] items-end gap-[var(--space-1)]"
      >
        {points.map((point) => (
          <div
            key={point.date}
            aria-hidden="true"
            className="flex flex-1 flex-col items-center gap-[var(--space-1)]"
          >
            <div className="flex h-full w-full items-end rounded-[var(--radius-sm)] bg-surface-2">
              {point.ratio !== null ? (
                <div
                  className="w-full rounded-[var(--radius-sm)] bg-accent"
                  style={{ height: `${point.ratio * 100}%` }}
                />
              ) : null}
            </div>
            <span className="text-xs text-muted">{weekdayOf(point.date)}</span>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>날짜별 달성률</caption>
        <thead>
          <tr>
            <th scope="col">날짜</th>
            <th scope="col">달성률</th>
          </tr>
        </thead>
        <tbody>
          {points.map((point) => (
            <tr key={point.date}>
              <th scope="row">{formatHeatmapDate(point.date)}</th>
              <td>{point.ratio === null ? '기록 없음' : `${Math.round(point.ratio * 100)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
