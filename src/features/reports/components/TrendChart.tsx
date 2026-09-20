'use client';

import { formatHeatmapDate } from '@/features/reports/lib/format';
import type { TrendPoint } from '@/features/reports/lib/period-summary';

import { cn } from '@/lib/cn';

/** 요일 라벨(일~토, `Date#getDay()` 순서 그대로 — review n1, 이전 주석 "월~일"이 배열과 어긋나 있었다). 막대 아래 장식(aria-hidden) — 실제 정보는 대체 표가 낸다. */
const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 이 개수를 넘으면 요일 라벨 대신 월 눈금으로 바꾼다(review M5, Blocker 로 격상 — 실측:
 * "올해"(최대 365일)에서 요일 글자 366개가 "글자 벽"이 되고, `flex-1` 열이 서브픽셀로
 * 짜부라지며 페이지 높이가 2398px → 5887px 로 부풀었다). 30일(지난 30일 프리셋)까지는 요일
 * 라벨이 실제로 읽히고 칸도 넉넉해 그대로 둔다 — 경계가 거기다.
 */
const DENSE_POINT_THRESHOLD = 30;

function weekdayOf(dateKey: string): string {
  return WEEKDAY_LABELS[new Date(`${dateKey}T00:00:00`).getDay()] ?? '';
}

/** 월의 첫날(또는 배열의 첫 칸)에만 눈금을 찍고 나머지는 비운다 — 라벨이 아니라 눈금이다. */
function monthTickOf(dateKey: string, index: number): string {
  const day = Number(dateKey.slice(8, 10));
  if (index !== 0 && day !== 1) return '';
  return `${Number(dateKey.slice(5, 7))}월`;
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
 *
 * `points.length`(선택 기간의 날 수)가 `DENSE_POINT_THRESHOLD` 를 넘으면(review M5) 열을
 * `flex-1` 대신 고정 폭으로 그리고 가로 스크롤을 준다 — 열 수백 개를 좁은 카드 폭에 욱여넣지
 * 않는다. 데이터 해상도(하루 한 칸)는 그대로 두고 **라벨만** 성기게 한다: 매일 요일 글자를
 * 찍으면 글자 벽이 되므로, 그 구간에서는 달이 바뀌는 첫날에만 월 눈금을 찍는다.
 */
export function TrendChart({ points }: TrendChartProps) {
  if (points.every((p) => p.ratio === null)) {
    // review n6 — 카드마다 다른 빈 문구(같은 문장의 합창이 되지 않게).
    return <p className="text-sm text-muted">이 기간엔 표시할 추이가 없어요</p>;
  }

  const average = averageRatio(points);
  const summaryLabel =
    average === null
      ? '기록 없음'
      : `최근 ${points.length}일 평균 달성률 ${Math.round(average * 100)}퍼센트`;
  const isDense = points.length > DENSE_POINT_THRESHOLD;

  return (
    <div>
      <div
        role="img"
        aria-label={summaryLabel}
        className={cn('flex h-[80px] items-end gap-[var(--space-1)]', isDense && 'overflow-x-auto')}
      >
        {points.map((point, index) => (
          <div
            key={point.date}
            aria-hidden="true"
            className={cn(
              'flex h-full flex-col items-center gap-[var(--space-1)]',
              isDense ? 'w-[6px] shrink-0' : 'flex-1',
            )}
          >
            <div className="flex h-full w-full items-end rounded-[var(--radius-sm)] bg-surface-2">
              {point.ratio !== null ? (
                <div
                  className="w-full rounded-[var(--radius-sm)] bg-accent"
                  style={{ height: `${point.ratio * 100}%` }}
                />
              ) : null}
            </div>
            <span className="text-[10px] leading-none text-muted">
              {isDense ? monthTickOf(point.date, index) : weekdayOf(point.date)}
            </span>
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
