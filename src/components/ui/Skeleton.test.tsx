import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Skeleton } from '@/components/ui/Skeleton';

describe('Skeleton', () => {
  it('내용이 없는 자리표시자라 접근성 트리에 노출되지 않는다', () => {
    const { container } = render(
      <div>
        <Skeleton className="h-[var(--space-5)] w-full" />
        <span>불러오는 중</span>
      </div>,
    );

    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
    expect(screen.getByText('불러오는 중')).toBeInTheDocument();
  });

  it('사용처가 준 크기 클래스를 유지한다', () => {
    const { container } = render(<Skeleton className="h-[var(--space-5)] w-full" />);

    expect(container.firstElementChild).toHaveClass('h-[var(--space-5)]', 'w-full');
  });
});
