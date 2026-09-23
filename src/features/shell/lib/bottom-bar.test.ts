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

/** `observeBottomBar` 가 다음 프레임으로 모아 계산한다(rAF 배칭) — 프레임 하나를 넘긴다. */
async function nextFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  await new Promise((resolve) => setTimeout(resolve, 0));
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
    await nextFrame();
    stop();
    expect(seen.at(-1)).toBe(53);
  });

  it('막대가 없어지면(≥768로 폭이 바뀌는 등) 0 으로 돌아간다', async () => {
    const bar = addBar(53);
    const seen: number[] = [];
    const stop = observeBottomBar(document, (px) => seen.push(px));
    bar?.remove();
    await nextFrame();
    stop();
    expect(seen.at(-1)).toBe(0);
  });

  it('같은 프레임 안의 mutation 여러 번은 한 번의 재계산으로 모은다(성능 — rAF 배칭)', async () => {
    const seen: number[] = [];
    const stop = observeBottomBar(document, (px) => seen.push(px));
    const before = seen.length;
    addBar(53);
    document.body.append(document.createElement('span'));
    document.body.append(document.createElement('span'));
    await nextFrame();
    stop();
    // 초기 호출(0) 뒤, 이 프레임에서 쌓인 세 번의 mutation 이 재계산 **한 번**만 더한다.
    expect(seen.length - before).toBe(1);
    expect(seen.at(-1)).toBe(53);
  });
});
