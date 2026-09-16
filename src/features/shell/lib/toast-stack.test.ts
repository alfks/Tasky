// 토스트 뷰포트가 서로 겹치지 않게 쌓인다 (app-shell.md R8, 리뷰 필수항목 1).
//
// jsdom 은 레이아웃을 계산하지 않아 `getBoundingClientRect` 가 전부 0 이다. 그래서 높이를 **주입**해
// 쌓임 계산 자체를 검사한다. 실제 좌표는 실 Chromium 으로 따로 쟀다(PR 본문).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  TOAST_STACK_ATTR,
  TOAST_STACK_GAP_PX,
  bottomReservedPx,
  observeToastViewports,
  restackToastViewports,
} from '@/features/shell/lib/toast-stack';

/** 옵저버가 다음 프레임으로 모아 계산한다 — 프레임 하나를 넘긴다. */
async function nextFrame(): Promise<void> {
  await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
  await new Promise((resolve) => setTimeout(resolve, 0));
}

import { OVERLAY_ALWAYS_LIVE_ATTR } from '@/components/ui/overlay-rules';

/** 뷰포트 하나 = `data-overlay-always-live` 루트 + 라이브 영역 둘. `toasts` 만큼 자식을 넣는다. */
function addViewport(toasts: number, height = 55): HTMLElement {
  const root = document.createElement('div');
  root.setAttribute(OVERLAY_ALWAYS_LIVE_ATTR, '');
  const polite = document.createElement('div');
  const assertive = document.createElement('div');
  for (let i = 0; i < toasts; i += 1) polite.append(document.createElement('div'));
  root.append(polite, assertive);
  vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ height } as DOMRect);
  document.body.append(root);
  return root;
}

beforeEach(() => {
  document.body.innerHTML = '';
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('restackToastViewports', () => {
  it('토스트가 하나뿐이면 아무것도 밀지 않는다', () => {
    const only = addViewport(1);
    expect(restackToastViewports(document)).toBe(1);
    expect(only.style.bottom).toBe('');
    expect(only.hasAttribute(TOAST_STACK_ATTR)).toBe(false);
  });

  it('둘이 동시에 뜨면 뒤엣것을 높이 + 간격만큼 밀어 올린다', () => {
    const first = addViewport(1, 55);
    const second = addViewport(1, 55);
    expect(restackToastViewports(document)).toBe(2);
    expect(first.style.bottom).toBe('');
    expect(second.style.bottom).toBe(`calc(var(--space-6) + ${55 + TOAST_STACK_GAP_PX}px)`);
  });

  it('셋이면 누적된다', () => {
    addViewport(1, 40);
    addViewport(1, 30);
    const third = addViewport(1, 20);
    restackToastViewports(document);
    expect(third.style.bottom).toBe(
      `calc(var(--space-6) + ${40 + TOAST_STACK_GAP_PX + 30 + TOAST_STACK_GAP_PX}px)`,
    );
  });

  it('비어 있는 뷰포트는 자리를 차지하지 않는다 — 넷 중 둘만 떠 있어도 한 칸만 밀린다', () => {
    addViewport(0);
    const first = addViewport(1, 50);
    addViewport(0);
    const second = addViewport(1, 50);
    expect(restackToastViewports(document)).toBe(2);
    expect(first.style.bottom).toBe('');
    expect(second.style.bottom).toBe(`calc(var(--space-6) + ${50 + TOAST_STACK_GAP_PX}px)`);
  });

  it('토스트가 닫히면 밀어 둔 값을 걷어낸다', () => {
    addViewport(1, 50);
    const second = addViewport(1, 50);
    restackToastViewports(document);
    second.children[0]?.replaceChildren();
    restackToastViewports(document);
    expect(second.style.bottom).toBe('');
    expect(second.hasAttribute(TOAST_STACK_ATTR)).toBe(false);
  });
});

describe('observeToastViewports', () => {
  it('나중에 뜬 토스트도 잡는다', async () => {
    addViewport(1, 50);
    const second = addViewport(0, 50);
    const stop = observeToastViewports(document);
    second.children[0]?.append(document.createElement('div'));
    await nextFrame();
    expect(second.style.bottom).toBe(`calc(var(--space-6) + ${50 + TOAST_STACK_GAP_PX}px)`);
    stop();
  });

  it('멈추면 넣어 둔 인라인 스타일을 전부 되돌린다', () => {
    addViewport(1, 50);
    const second = addViewport(1, 50);
    const stop = observeToastViewports(document);
    expect(second.style.bottom).not.toBe('');
    stop();
    expect(second.style.bottom).toBe('');
  });
});

describe('하단 고정 막대 비켜 가기 (400px 에서 토스트가 [+ 할 일] 라벨을 가리던 자리)', () => {
  function addBottomBar(height: number): HTMLElement {
    const bar = document.createElement('div');
    bar.setAttribute('data-shell-bottom-bar', '');
    vi.spyOn(bar, 'getBoundingClientRect').mockReturnValue({ height } as DOMRect);
    document.body.append(bar);
    return bar;
  }

  it('막대가 없으면 0', () => {
    expect(bottomReservedPx(document)).toBe(0);
  });

  it('막대가 있으면 높이 + 간격', () => {
    addBottomBar(53);
    expect(bottomReservedPx(document)).toBe(53 + TOAST_STACK_GAP_PX);
  });

  it('토스트가 하나뿐이어도 막대 위로 올라간다', () => {
    addBottomBar(53);
    const only = addViewport(1, 55);
    restackToastViewports(document);
    expect(only.style.bottom).toBe(`calc(var(--space-6) + ${53 + TOAST_STACK_GAP_PX}px)`);
    expect(only.hasAttribute(TOAST_STACK_ATTR)).toBe(true);
  });
});
