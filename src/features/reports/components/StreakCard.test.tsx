import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { StreakCard } from '@/features/reports/components/StreakCard';

describe('StreakCard (review M1·M4)', () => {
  it('연속 일수와 "최근 12주 기준" 근거를 함께 보여준다', () => {
    render(<StreakCard streak={5} todayTotal={1} todayIsAllDone={true} />);
    expect(screen.getByText(/5일째 연속 달성/)).toBeInTheDocument();
    expect(screen.getByText('최근 12주 기준(오늘부터)')).toBeInTheDocument();
  });

  it('진짜 기록이 없으면(오늘 투두도 0개) "아직 연속 기록이 없어요"다', () => {
    render(<StreakCard streak={0} todayTotal={0} todayIsAllDone={false} />);
    expect(screen.getByText('아직 연속 기록이 없어요')).toBeInTheDocument();
  });

  it('오늘 투두가 있는데 다 못 했으면(스트릭 0의 정상 경로) "기록 없음"이라 거짓말하지 않는다(재현: 2개 중 1개 완료)', () => {
    render(<StreakCard streak={0} todayTotal={2} todayIsAllDone={false} />);
    expect(screen.getByText('오늘 아직 다 못 했어요')).toBeInTheDocument();
    expect(screen.queryByText(/기록이 없어요/)).not.toBeInTheDocument();
  });
});
