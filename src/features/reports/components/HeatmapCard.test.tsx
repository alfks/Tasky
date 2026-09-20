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
});
