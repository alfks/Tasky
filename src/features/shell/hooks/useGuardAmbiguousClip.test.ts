// 맨 위(scrollTop=0)에서 반복되는 상호작용(체크·추가·삭제)에 스크롤 보정이 재발동하지 않는다
// (최종 리뷰 Minor). 순수 함수(`ambiguousClipPx`/`guardAmbiguousClip`) 자체는
// `lib/scroll-clip-guard.test.ts` 가 잰다 — 여기서는 그 위에서 훅이 "언제 다시 부르는가"만 잰다.
import type { RefObject } from 'react';

import { renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGuardAmbiguousClip } from '@/features/shell/hooks/useGuardAmbiguousClip';

function setControlHeight(px: string): void {
  document.documentElement.style.setProperty('--control-height', px);
}

/** `lib/scroll-clip-guard.test.ts` 의 makeScene 과 같은 요령 — jsdom 은 레이아웃을 계산하지 않는다. */
function makeScrollArea(): { el: HTMLDivElement; setClipped: (clipped: boolean) => void } {
  const el = document.createElement('div');
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({ bottom: 500 } as DOMRect);
  let scrollTop = 0;
  Object.defineProperty(el, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = v;
    },
    configurable: true,
  });

  let targetBottom = 480; // 기본은 안 잘림
  const button = document.createElement('button');
  vi.spyOn(button, 'getBoundingClientRect').mockImplementation(
    () =>
      ({
        bottom: targetBottom,
      }) as DOMRect,
  );
  el.append(button);
  document.body.append(el);

  return { el, setClipped: (clipped) => (targetBottom = clipped ? 520 : 480) };
}

async function flush(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  document.body.innerHTML = '';
  setControlHeight('36px');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('useGuardAmbiguousClip', () => {
  it('맨 위에서 항목을 체크/추가/삭제해도 한 번 보정한 뒤에는 스크롤이 다시 움직이지 않는다', async () => {
    const { el, setClipped } = makeScrollArea();
    setClipped(true); // 20px 잘려 있다(threshold 36px 미만 — 애매한 클립)
    const ref: RefObject<HTMLElement | null> = { current: el };

    renderHook(() => useGuardAmbiguousClip(ref, true, 'd1'));
    await flush();
    expect(el.scrollTop).toBe(20); // 첫 보정

    // 사용자가 일부러 다시 맨 위로 올린다.
    el.scrollTop = 0;

    // 체크 → 목록 mutation.
    el.append(document.createElement('li'));
    await flush();
    expect(el.scrollTop).toBe(0);

    // 추가 → 또 mutation.
    el.append(document.createElement('li'));
    await flush();
    expect(el.scrollTop).toBe(0);

    // 삭제 → 또 mutation.
    el.removeChild(el.firstChild as ChildNode);
    await flush();
    expect(el.scrollTop).toBe(0);
  });

  it('아직 한 번도 보정하지 않았다면(로딩 중이라 clip=0) 실제 목록이 도착했을 때 그때 보정한다', async () => {
    const { el, setClipped } = makeScrollArea();
    setClipped(false); // 로딩 중 — 아직 잘리지 않음
    const ref: RefObject<HTMLElement | null> = { current: el };

    renderHook(() => useGuardAmbiguousClip(ref, true, 'd1'));
    await flush();
    expect(el.scrollTop).toBe(0); // 아직 보정할 게 없다

    setClipped(true); // 실제 목록이 도착 — 이제 애매하게 잘린다
    el.append(document.createElement('li')); // mutation 신호
    await flush();
    expect(el.scrollTop).toBe(20); // 첫 보정은 여기서 일어난다
  });

  it('resetKey(선택 날짜)가 바뀌면 다시 유효해진다 — 목록이 통째로 바뀐 것이다', async () => {
    const { el, setClipped } = makeScrollArea();
    setClipped(true);
    const ref: RefObject<HTMLElement | null> = { current: el };

    const { rerender } = renderHook(({ resetKey }) => useGuardAmbiguousClip(ref, true, resetKey), {
      initialProps: { resetKey: 'd1' },
    });
    await flush();
    expect(el.scrollTop).toBe(20);

    el.scrollTop = 0; // 새 날짜에서 맨 위를 보는 자연스러운 첫 상태
    rerender({ resetKey: 'd2' });
    await flush();
    expect(el.scrollTop).toBe(20); // 날짜가 바뀌었으니 다시 유효하다
  });

  it('active 가 꺼지면 보정을 걸지 않는다', async () => {
    const { el, setClipped } = makeScrollArea();
    setClipped(true);
    const ref: RefObject<HTMLElement | null> = { current: el };

    renderHook(() => useGuardAmbiguousClip(ref, false, 'd1'));
    await flush();
    expect(el.scrollTop).toBe(0);
  });
});
