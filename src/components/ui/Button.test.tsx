import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/Button';

describe('Button', () => {
  it('보이는 글자가 접근 가능한 이름이 되고 클릭하면 실행된다', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>저장</Button>);

    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('키보드(Tab → Enter)로 실행된다', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>저장</Button>);

    await userEvent.tab();
    expect(screen.getByRole('button', { name: '저장' })).toHaveFocus();
    await userEvent.keyboard('{Enter}');

    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('로딩 중에는 aria-busy 가 붙고 클릭이 먹지 않는다', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        저장
      </Button>,
    );

    const button = screen.getByRole('button', { name: '저장' });
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);

    expect(onClick).not.toHaveBeenCalled();
  });

  it('비활성이면 클릭이 먹지 않는다', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        저장
      </Button>,
    );

    await userEvent.click(screen.getByRole('button', { name: '저장' }));

    expect(onClick).not.toHaveBeenCalled();
  });

  it('폼 안에서도 암묵 제출을 하지 않는다(type 기본값 button)', () => {
    render(<Button>저장</Button>);

    expect(screen.getByRole('button', { name: '저장' })).toHaveAttribute('type', 'button');
  });
});
