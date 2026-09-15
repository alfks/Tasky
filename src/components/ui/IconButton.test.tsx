import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { IconButton } from '@/components/ui/IconButton';

describe('IconButton', () => {
  it('label 이 접근 가능한 이름이 되고 아이콘은 이름에 섞이지 않는다', () => {
    render(
      <IconButton label="설정 열기">
        <span>⚙</span>
      </IconButton>,
    );

    expect(screen.getByRole('button', { name: '설정 열기' })).toBeInTheDocument();
  });

  it('키보드(Tab → Space)로 실행된다', async () => {
    const onClick = vi.fn();
    render(
      <IconButton label="설정 열기" onClick={onClick}>
        <span>⚙</span>
      </IconButton>,
    );

    await userEvent.tab();
    expect(screen.getByRole('button', { name: '설정 열기' })).toHaveFocus();
    await userEvent.keyboard(' ');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('aria-pressed 같은 상태 속성을 그대로 전달한다', () => {
    render(
      <IconButton label="다크 모드로 전환" aria-pressed={false}>
        <span>☾</span>
      </IconButton>,
    );

    expect(screen.getByRole('button', { name: '다크 모드로 전환' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });
});
