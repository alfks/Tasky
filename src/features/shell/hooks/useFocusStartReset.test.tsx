// 첫 Tab 의 출발점 되돌리기 (app-shell.md R10). 인과는 훅 주석에 있다.
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useFocusStartReset } from '@/features/shell/hooks/useFocusStartReset';

function Probe() {
  useFocusStartReset();
  return <button type="button">버튼</button>;
}

/** jsdom 은 rAF 를 타이머로 흉내낸다 — 한 프레임을 넘긴다. */
async function nextFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  document.body.removeAttribute('tabindex');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useFocusStartReset', () => {
  it('아무도 포커스를 잡지 않았으면 `body` 를 잠깐 포커스했다 뺀다', async () => {
    const focus = vi.spyOn(document.body, 'focus');
    const blur = vi.spyOn(document.body, 'blur');
    render(<Probe />);
    await nextFrame();
    expect(focus).toHaveBeenCalledTimes(1);
    expect(blur).toHaveBeenCalledTimes(1);
  });

  it('빌려 쓴 `tabindex` 를 남기지 않는다 — 문서에 흔적이 남으면 안 된다', async () => {
    render(<Probe />);
    await nextFrame();
    expect(document.body.hasAttribute('tabindex')).toBe(false);
  });

  it('이미 무언가에 포커스가 있으면 건드리지 않는다 — 사용자의 자리를 뺏지 않는다', async () => {
    const { getByRole } = render(<Probe />);
    const button = getByRole('button', { name: '버튼' });
    button.focus();
    const focus = vi.spyOn(document.body, 'focus');
    await nextFrame();
    expect(focus).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button);
  });
});
