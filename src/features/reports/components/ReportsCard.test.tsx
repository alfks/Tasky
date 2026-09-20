import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ReportsCard } from '@/features/reports/components/ReportsCard';

describe('ReportsCard (review m9 — 카드 제목은 h3)', () => {
  it('제목을 h3 로, 내용을 section 랜드마크 안에 그린다', () => {
    render(
      <ReportsCard title="달성률 추이">
        <p>내용</p>
      </ReportsCard>,
    );

    const region = screen.getByRole('region', { name: '달성률 추이' });
    expect(region.tagName).toBe('SECTION');
    expect(screen.getByRole('heading', { level: 3, name: '달성률 추이' })).toBeInTheDocument();
    expect(screen.getByText('내용')).toBeInTheDocument();
  });
});
