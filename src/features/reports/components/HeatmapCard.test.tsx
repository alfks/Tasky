import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DateKey } from '@/domain/date/date-key';

import { HeatmapCard } from '@/features/reports/components/HeatmapCard';
import type { HeatmapCell } from '@/features/reports/lib/period-summary';

const TODAY: DateKey = '2026-09-18';

function cell(date: DateKey, level: HeatmapCell['level'], total = 4, doneCount = 0): HeatmapCell {
  return { date, level, total, doneCount };
}

describe('HeatmapCard (stats.md R6·§5)', () => {
  it('role=img 로 그리고, 칸 단위 상세는 대체 표로 낸다', () => {
    const weeks: HeatmapCell[][] = [
      [
        cell('2026-09-14', 4, 4, 4),
        cell('2026-09-15', 0, 0, 0),
        cell('2026-09-16', 2, 4, 1),
        cell('2026-09-17', 3, 4, 3),
        cell('2026-09-18', 1, 4, 0),
      ],
    ];

    render(<HeatmapCard weeks={weeks} today={TODAY} />);

    expect(screen.getByRole('img', { name: '최근 12주 활동 히트맵' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: '날짜별 활동' });
    expect(table).toHaveClass('sr-only');
    expect(screen.getByRole('cell', { name: '완료 100%' })).toBeInTheDocument();
    expect(screen.getByRole('cell', { name: '기록 없음' })).toBeInTheDocument();
  });

  it('격자 자체의 배경은 --color-surface 다(theme.md §3-H — 0단계 대비가 surface-2 에서는 무너진다)', () => {
    const weeks: HeatmapCell[][] = [[cell('2026-09-18', 4, 1, 1)]];

    render(<HeatmapCard weeks={weeks} today={TODAY} />);

    // 우연히 부모(ReportsCard)가 같은 색이어서가 아니라, 이 컴포넌트가 직접 선언한다.
    expect(screen.getByRole('img', { name: '최근 12주 활동 히트맵' })).toHaveClass('bg-surface');
  });

  it('오늘 이후 날짜는 표에도 나오지 않는다', () => {
    const weeks: HeatmapCell[][] = [
      [cell('2026-09-18', 4, 1, 1), cell('2026-09-19', 4, 1, 1), cell('2026-09-20', 4, 1, 1)],
    ];

    render(<HeatmapCard weeks={weeks} today={TODAY} />);

    // sr-only 표에 오늘(9/18)만 있고 9/19·9/20 은 없다.
    expect(screen.getByText('9월 18일')).toBeInTheDocument();
    expect(screen.queryByText('9월 19일')).not.toBeInTheDocument();
    expect(screen.queryByText('9월 20일')).not.toBeInTheDocument();
  });

  it('전부 기록이 없으면 빈 상태 문구다', () => {
    const weeks: HeatmapCell[][] = [[cell('2026-09-18', 0, 0, 0)]];

    render(<HeatmapCard weeks={weeks} today={TODAY} />);

    expect(screen.getByText('이 기간에 기록이 없어요')).toBeInTheDocument();
  });

  it('고대비(forced-colors) 모드에서는 배경색이 아니라 테두리 굵기로 단계가 구분된다', () => {
    const weeks: HeatmapCell[][] = [[cell('2026-09-18', 0, 0, 0), cell('2026-09-17', 4, 4, 4)]];

    render(<HeatmapCard weeks={weeks} today={TODAY} />);

    // "기록 없음"(0단계)은 테두리가 없다 — forced-colors 에서도 배경만으로 뭉개지는 값이 없다.
    const empty = screen.getByTitle(/기록 없음/);
    expect(empty.className).not.toContain('forced-colors:[border-width');
    // "완료 100%"(4단계)는 가장 굵은 테두리를 갖는다.
    const full = screen.getByTitle(/완료 100%/);
    expect(full.className).toContain('forced-colors:[border-width:4px]');
  });
});
