import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StreakCard } from '@/features/reports/components/StreakCard';

describe('StreakCard', () => {
  it('연속 일수를 보여준다', () => {
    render(<StreakCard streak={5} />);
    expect(screen.getByText(/5일째 연속 달성/)).toBeInTheDocument();
  });

  it('0이면 빈 상태 문구다', () => {
    render(<StreakCard streak={0} />);
    expect(screen.getByText('이 기간에 기록이 없어요')).toBeInTheDocument();
  });
});
