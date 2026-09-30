import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { CategoryAudiencePicker } from '@/features/category/components/CategoryAudiencePicker';

describe('카테고리 공개 범위 선택', () => {
  it('세 범위를 글자로 구별하고 선택만으로 저장하지 않는다', async () => {
    const change = vi.fn();
    render(<CategoryAudiencePicker value="private" onChange={change} />);
    expect(screen.getByRole('radio', { name: '나만 보기' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '친구만' })).not.toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: '모두 공개' }));
    expect(change).toHaveBeenCalledWith('public');
    expect(screen.getByRole('radio', { name: '나만 보기' })).toBeChecked();
  });
});
