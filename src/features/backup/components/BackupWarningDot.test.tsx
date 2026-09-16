import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BackupWarningDot } from '@/features/backup/components/BackupWarningDot';

describe('BackupWarningDot (R14)', () => {
  it('닫기 버튼이 없다 — 경고를 끌 수 있는 조작이 하나도 없다', () => {
    const { container } = render(<BackupWarningDot />);
    expect(container.querySelectorAll('button')).toHaveLength(0);
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(container.querySelectorAll('[role="button"]')).toHaveLength(0);
  });

  it('색만으로 정보를 주지 않는다 — 보조 문구가 함께 있다', () => {
    render(<BackupWarningDot />);
    expect(screen.getByText('백업한 지 오래됐어요')).toBeInTheDocument();
  });

  it('점 자체는 장식이라 보조 기술에 노출되지 않는다', () => {
    render(<BackupWarningDot />);
    expect(screen.getByTestId('backup-warning-dot')).toHaveAttribute('aria-hidden', 'true');
  });
});
