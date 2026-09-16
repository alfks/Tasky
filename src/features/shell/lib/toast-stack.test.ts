// 토스트가 하단 고정 막대를 덮지 않게 자리를 비운다 (app-shell.md R8).
//
// jsdom 은 레이아웃을 계산하지 않아 `getBoundingClientRect` 가 전부 0 이다. 그래서 높이를 **주입**해
// 계산 자체를 검사한다. 실제 좌표는 실 Chromium 으로 따로 쟀다(PR 본문).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  BOTTOM_BAR_SELECTOR,
  TOAST_BOTTOM_RESERVE_VAR,
  TOAST_STACK_GAP_PX,
  bottomReservedPx,
  observeToastViewports,
  publishBottomReserve,
} from '@/features/shell/lib/toast-stack';

/** 옵저버가 다음 프레임으로 모아 계산한다 — 프레임 하나를 넘긴다. */
async function nextFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

function addBottomBar(height: number): HTMLElement {
  const bar = document.createElement('div');
  bar.setAttribute('data-shell-bottom-bar', '');
  vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ height } as DOMRect);
  document.body.append(bar);
  return bar;
}

const reserve = (): string =>
  document.documentElement.style.getPropertyValue(TOAST_BOTTOM_RESERVE_VAR);

beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.style.removeProperty(TOAST_BOTTOM_RESERVE_VAR);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('bottomReservedPx', () => {
  it('막대가 없으면 0', () => {
    expect(bottomReservedPx(document)).toBe(0);
  });

  it('막대가 있으면 높이 + 간격', () => {
    addBottomBar(53);
    expect(bottomReservedPx(document)).toBe(53 + TOAST_STACK_GAP_PX);
  });

  it('높이가 0 이면(막대가 접혀 있으면) 0', () => {
    addBottomBar(0);
    expect(bottomReservedPx(document)).toBe(0);
  });

  it('막대는 문구가 아니라 표식으로 찾는다 — ShellMain 의 BOTTOM_BAR_ATTR 과 한 쌍이다', () => {
    expect(BOTTOM_BAR_SELECTOR).toBe('[data-shell-bottom-bar]');
  });
});

describe('publishBottomReserve — 잰 값을 CSS 변수로 올린다', () => {
  it('막대가 있으면 문서 루트에 px 로 올린다', () => {
    addBottomBar(53);
    expect(publishBottomReserve(document)).toBe(53 + TOAST_STACK_GAP_PX);
    expect(reserve()).toBe(`${53 + TOAST_STACK_GAP_PX}px`);
  });

  it('막대가 없으면 변수를 지운다 — 남겨 두면 넓은 화면에서도 자리를 먹는다', () => {
    addBottomBar(53);
    publishBottomReserve(document);
    document.body.innerHTML = '';
    expect(publishBottomReserve(document)).toBe(0);
    expect(reserve()).toBe('');
  });

  it('남의 요소에는 아무것도 쓰지 않는다 — 좌표 조작은 T-30 에서 사라졌다', () => {
    const bar = addBottomBar(53);
    publishBottomReserve(document);
    expect(bar.getAttribute('style')).toBeNull();
  });
});

describe('observeToastViewports', () => {
  it('막대가 나중에 떠도 잡는다', async () => {
    const stop = observeToastViewports(document);
    expect(reserve()).toBe('');
    addBottomBar(50);
    await nextFrame();
    expect(reserve()).toBe(`${50 + TOAST_STACK_GAP_PX}px`);
    stop();
  });

  it('막대가 사라지면 자리를 돌려준다', async () => {
    addBottomBar(50);
    const stop = observeToastViewports(document);
    expect(reserve()).toBe(`${50 + TOAST_STACK_GAP_PX}px`);
    document.body.innerHTML = '';
    await nextFrame();
    expect(reserve()).toBe('');
    stop();
  });

  it('멈추면 올려 둔 변수를 걷어낸다', () => {
    addBottomBar(50);
    const stop = observeToastViewports(document);
    expect(reserve()).not.toBe('');
    stop();
    expect(reserve()).toBe('');
  });
});
