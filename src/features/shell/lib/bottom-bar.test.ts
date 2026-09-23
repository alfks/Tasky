// 하단 고정 [+ 할 일] 막대의 실측 높이(목록 스크롤 영역이 그만큼을 padding-bottom 으로 비운다).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BOTTOM_BAR_SELECTOR,
  measureBottomBar,
  observeBottomBar,
} from '@/features/shell/lib/bottom-bar';

function addBar(height: number | null): HTMLElement | null {
  if (height === null) return null;
  const bar = document.createElement('div');
  bar.setAttribute('data-shell-bottom-bar', '');
  vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ height } as DOMRect);
  document.body.append(bar);
  return bar;
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('measureBottomBar', () => {
  it('막대가 없으면 0 — ≥768(showBottomAdd=false)과 같은 상태', () => {
    expect(measureBottomBar(document)).toBe(0);
  });

  it('막대가 있으면 그 높이 그대로', () => {
    addBar(53);
    expect(measureBottomBar(document)).toBe(53);
  });

  it('선택자는 ShellMain 의 BOTTOM_BAR_ATTR 표식이다', () => {
    expect(BOTTOM_BAR_SELECTOR).toBe('[data-shell-bottom-bar]');
  });
});

describe('observeBottomBar', () => {
  it('막대가 나중에 떠도 알린다', async () => {
    const seen: number[] = [];
    const stop = observeBottomBar(document, (px) => seen.push(px));
    addBar(53);
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
    expect(seen.at(-1)).toBe(53);
  });

  it('막대가 없어지면(≥768로 폭이 바뀌는 등) 0 으로 돌아간다', async () => {
    const bar = addBar(53);
    const seen: number[] = [];
    const stop = observeBottomBar(document, (px) => seen.push(px));
    bar?.remove();
    await new Promise((resolve) => setTimeout(resolve, 0));
    stop();
    expect(seen.at(-1)).toBe(0);
  });
});
