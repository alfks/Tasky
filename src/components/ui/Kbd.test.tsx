import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Kbd } from '@/components/ui/Kbd';

describe('Kbd', () => {
  it('키 이름을 kbd 요소로 렌더한다', () => {
    render(<Kbd>Esc</Kbd>);

    const kbd = screen.getByText('Esc');
    expect(kbd.tagName).toBe('KBD');
  });
});
