import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { CategoryRatioCard } from '@/features/reports/components/CategoryRatioCard';
import { makeCategory } from '@/test/fixtures/category';

describe('CategoryRatioCard (completion-rate.md R5 패턴 재사용)', () => {
  it('completion-rate.md R5 와 같은 progressbar 패턴으로 그린다', () => {
    const category = makeCategory({ name: '공부' });
    render(
      <CategoryRatioCard
        counts={[{ categoryId: category.id, done: 2, total: 4 }]}
        categories={[category]}
      />,
    );

    const bar = screen.getByRole('progressbar', { name: '공부' });
    expect(bar).toHaveAttribute('aria-valuemin', '0');
    expect(bar).toHaveAttribute('aria-valuemax', '4');
    expect(bar).toHaveAttribute('aria-valuenow', '2');
    expect(bar).toHaveAttribute('aria-valuetext', '4개 중 2개 완료');
  });

  it('채움 막대가 stats/CategoryBars.tsx 와 같은 전환을 쓴다(review m3 — 전에는 여기만 빠져 있었다)', () => {
    const category = makeCategory({ name: '공부' });
    render(
      <CategoryRatioCard
        counts={[{ categoryId: category.id, done: 2, total: 4 }]}
        categories={[category]}
      />,
    );

    const fill = screen.getByRole('progressbar', { name: '공부' }).firstElementChild;
    expect(fill?.className).toContain('transition-[width]');
    expect(fill?.className).toContain('duration-[var(--motion-base)]');
  });

  it('기간에 카테고리 데이터가 없으면 빈 상태 문구를 보여준다', () => {
    render(<CategoryRatioCard counts={[]} categories={[]} />);

    expect(screen.getByText('이 기간엔 분류할 카테고리가 없어요')).toBeInTheDocument();
  });
});
