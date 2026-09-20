import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { TrendChart } from '@/features/reports/components/TrendChart';

describe('TrendChart (stats.md R2·§5)', () => {
  it('role=img 로 평균 달성률 요약을 낭독한다', () => {
    render(
      <TrendChart
        points={[
          { date: '2026-09-18', ratio: 0.5 },
          { date: '2026-09-19', ratio: 1 },
        ]}
      />,
    );

    expect(screen.getByRole('img', { name: '최근 2일 평균 달성률 75퍼센트' })).toBeInTheDocument();
  });

  it('칸 단위 상세는 시각적으로 숨긴 대체 표로 낸다', () => {
    render(<TrendChart points={[{ date: '2026-09-18', ratio: 0.5 }]} />);

    const table = screen.getByRole('table', { name: '날짜별 달성률' });
    expect(table).toHaveClass('sr-only');
    expect(screen.getByRole('cell', { name: '50%' })).toBeInTheDocument();
  });

  it('total===0 인 날(ratio null)은 표에서 "기록 없음"이다', () => {
    render(
      <TrendChart
        points={[
          { date: '2026-09-17', ratio: 0.5 },
          { date: '2026-09-18', ratio: null },
        ]}
      />,
    );

    expect(screen.getByRole('cell', { name: '기록 없음' })).toBeInTheDocument();
  });

  it('전부 기록 없음이면 빈 상태 문구를 보여준다', () => {
    render(<TrendChart points={[{ date: '2026-09-18', ratio: null }]} />);

    expect(screen.getByText('이 기간에 기록이 없어요')).toBeInTheDocument();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
