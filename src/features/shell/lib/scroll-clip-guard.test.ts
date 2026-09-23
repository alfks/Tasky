// 애매하게 잘린 마지막 상호작용 대상 보정 — `ambiguousClipPx`/`guardAmbiguousClip` 단위 테스트.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ambiguousClipPx, guardAmbiguousClip } from '@/features/shell/lib/scroll-clip-guard';

function setControlHeight(px: string): void {
  document.documentElement.style.setProperty('--control-height', px);
}

/**
 * 스크롤 영역과 그 안의 마지막 상호작용 대상(버튼)을 만든다. jsdom 은 레이아웃을 계산하지 않으므로
 * `getBoundingClientRect` 를 직접 건다 — 스크롤 영역의 아래쪽 끝(`containerBottom`)과 대상의
 * 아래쪽 끝(`targetBottom`) 차이가 곧 "잘린 만큼"이다.
 */
function makeScene(opts: {
  containerBottom: number;
  targetBottom: number;
  scrollTop: number;
  withTarget?: boolean;
}): HTMLElement {
  const scrollArea = document.createElement('div');
  vi.spyOn(scrollArea, 'getBoundingClientRect').mockReturnValue({
    bottom: opts.containerBottom,
  } as DOMRect);
  let scrollTop = opts.scrollTop;
  Object.defineProperty(scrollArea, 'scrollTop', {
    get: () => scrollTop,
    set: (v: number) => {
      scrollTop = v;
    },
    configurable: true,
  });
  if (opts.withTarget !== false) {
    const button = document.createElement('button');
    vi.spyOn(button, 'getBoundingClientRect').mockReturnValue({
      bottom: opts.targetBottom,
    } as DOMRect);
    scrollArea.append(button);
  }
  document.body.append(scrollArea);
  return scrollArea;
}

beforeEach(() => {
  document.body.innerHTML = '';
  setControlHeight('36px');
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('ambiguousClipPx', () => {
  it('마지막 대상이 컨테이너 안에 다 들어오면(안 잘림) 0', () => {
    const el = makeScene({ containerBottom: 500, targetBottom: 480, scrollTop: 0 });
    expect(ambiguousClipPx(el)).toBe(0);
  });

  it('컨트롤 하나 높이 미만으로 잘리면 그 잘린 만큼', () => {
    const el = makeScene({ containerBottom: 500, targetBottom: 520, scrollTop: 0 });
    expect(ambiguousClipPx(el)).toBe(20);
  });

  it('잘린 양이 컨트롤 하나 높이와 같으면(경계) 그만큼', () => {
    const el = makeScene({ containerBottom: 500, targetBottom: 536, scrollTop: 0 });
    expect(ambiguousClipPx(el)).toBe(36);
  });

  it('컨트롤 하나 높이보다 많이 잘리면(진짜 스크롤이 필요한 목록) 0 — 손대지 않는다', () => {
    const el = makeScene({ containerBottom: 500, targetBottom: 900, scrollTop: 0 });
    expect(ambiguousClipPx(el)).toBe(0);
  });

  it('마지막 대상 뒤에 다른(체크박스 아닌) 콘텐츠가 훨씬 더 넘쳐도, 대상 자신이 이미 다 보이면 0', () => {
    // 스크롤 영역 전체는 크게 넘칠 수 있어도(다이어리 카드 등), 판정은 **대상 하나**만 본다.
    const el = makeScene({ containerBottom: 500, targetBottom: 480, scrollTop: 0 });
    expect(ambiguousClipPx(el)).toBe(0);
  });

  it('이미 스크롤된 자리(scrollTop !== 0)는 절대 판정하지 않는다 — 사용자가 옮긴 자리를 존중한다', () => {
    const el = makeScene({ containerBottom: 500, targetBottom: 520, scrollTop: 5 });
    expect(ambiguousClipPx(el)).toBe(0);
  });

  it('상호작용 가능 요소가 하나도 없으면(빈 목록) 0', () => {
    const el = makeScene({
      containerBottom: 500,
      targetBottom: 520,
      scrollTop: 0,
      withTarget: false,
    });
    expect(ambiguousClipPx(el)).toBe(0);
  });

  it('--control-height 를 읽을 수 없으면(값 없음) 0 — 하드코딩 대신 안전하게 아무 일도 안 한다', () => {
    document.documentElement.style.removeProperty('--control-height');
    const el = makeScene({ containerBottom: 500, targetBottom: 520, scrollTop: 0 });
    expect(ambiguousClipPx(el)).toBe(0);
  });
});

describe('guardAmbiguousClip', () => {
  it('애매하면 그만큼 scrollTop 을 민다', () => {
    const el = makeScene({ containerBottom: 500, targetBottom: 520, scrollTop: 0 });
    guardAmbiguousClip(el);
    expect(el.scrollTop).toBe(20);
  });

  it('애매하지 않으면 scrollTop 을 그대로 둔다(멱등)', () => {
    const el = makeScene({ containerBottom: 500, targetBottom: 900, scrollTop: 0 });
    guardAmbiguousClip(el);
    expect(el.scrollTop).toBe(0);
  });
});
