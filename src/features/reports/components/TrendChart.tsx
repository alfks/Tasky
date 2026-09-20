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
            {/* review 라운드2 m18 — 밀집 모드의 6px 칸에 월 눈금("10월")을 그대로 두면 한 줄에
                못 들어가 "1"/"월" 두 줄로 접혀 3px 씩 이웃을 침범했다. `whitespace-nowrap` 으로
                한 줄을 강제하고 `overflow-visible` 로 칸 밖까지 그대로 새어 나가게 둔다 — 어차피
                장식(aria-hidden)이고 눈금은 성기게(30~ 일에 한 번) 찍혀 이웃과 겹칠 일이 드물다. */}
            <span className="overflow-visible text-[10px] leading-none whitespace-nowrap text-muted">
              {isDense ? monthTickOf(point.date, index) : weekdayOf(point.date)}
            </span>
          </div>
        ))}
      </div>
      {/*
        review 라운드2 M5(Blocker, 검증 리뷰어 재현) — `sr-only` 를 `<table>` 에 직접 주면
        width/height:1px 가 `display:table` 박스엔 **최소값**으로만 적용돼(테이블 자동 레이아웃
        알고리즘이 내용에 맞춰 다시 키운다) 표가 실제로 접히지 않는다. 366행짜리 표가 그대로
        문서 흐름에 펼쳐져 실측 documentElement.scrollHeight 가 900(평소) → 8004(custom 366일)
        까지 부풀었다 — 라운드2 의 `flex-1` 수정은 증상(글자 벽)만 없앴을 뿐 진짜 원인은
        그대로였다. `sr-only` 는 감싸는 `<div>`(block 박스, 표와 달리 min-content 로 되키지
        않는다)에 주고 `<table>` 자신은 장식을 받지 않는다.
      */}
      <div className="sr-only">
        <table>
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
    </div>
  );
}
