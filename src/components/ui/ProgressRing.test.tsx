import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ProgressRing } from '@/components/ui/ProgressRing';

const circlesOf = (container: HTMLElement) => Array.from(container.querySelectorAll('circle'));

describe('ProgressRing', () => {
  it('img 역할과 label 로 읽힌다', () => {
    render(
      <ProgressRing
        value={0.6}
        size={40}
        thickness={4}
        label="오늘 달성률 60퍼센트, 5개 중 3개 완료"
      />,
    );

    expect(
      screen.getByRole('img', { name: '오늘 달성률 60퍼센트, 5개 중 3개 완료' }),
    ).toBeInTheDocument();
  });

  it('투두가 없으면(value=null) 트랙만 그린다', () => {
    const { container } = render(
      <ProgressRing value={null} size={40} thickness={4} label="오늘 할 일 없음" />,
    );

    expect(circlesOf(container)).toHaveLength(1);
  });

  it('0 과 1 사이 값은 반올림 없이 둘레 비율로 그린다', () => {
    const { container } = render(
      <ProgressRing value={1 / 3} size={40} thickness={4} label="달성률" />,
    );

    const circumference = 2 * Math.PI * 18;
    const [, progress] = circlesOf(container);
    expect(Number(progress?.getAttribute('stroke-dashoffset'))).toBeCloseTo(
      circumference * (2 / 3),
      5,
    );
  });

  it('범위 밖 값은 0~1 로 잘라낸다', () => {
    const { container } = render(<ProgressRing value={2} size={40} thickness={4} label="달성률" />);

    const [, progress] = circlesOf(container);
    expect(Number(progress?.getAttribute('stroke-dashoffset'))).toBe(0);
  });
});
