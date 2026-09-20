import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReportsCard } from '@/features/reports/components/ReportsCard';

describe('ReportsCard', () => {
  it('제목을 h2 로, 내용을 section 랜드마크 안에 그린다', () => {
    render(
      <ReportsCard title="달성률 추이">
        <p>내용</p>
      </ReportsCard>,
    );

    const region = screen.getByRole('region', { name: '달성률 추이' });
    expect(region.tagName).toBe('SECTION');
    expect(screen.getByRole('heading', { level: 2, name: '달성률 추이' })).toBeInTheDocument();
    expect(screen.getByText('내용')).toBeInTheDocument();
  });

  it('emptyMessage 가 있으면 children 대신 그 문구를 보여준다', () => {
    render(
      <ReportsCard title="집중 시간" emptyMessage="이 기간에 기록이 없어요">
        <p>보이면 안 됨</p>
      </ReportsCard>,
    );

    expect(screen.getByText('이 기간에 기록이 없어요')).toBeInTheDocument();
    expect(screen.queryByText('보이면 안 됨')).not.toBeInTheDocument();
  });
});
