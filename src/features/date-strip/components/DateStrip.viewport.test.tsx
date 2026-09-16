// §2-B(좁은 화면 중앙 정렬·스냅)와 R10(모션 상한·reduced-motion)만 다룬다.
// 둘 다 "화면이 실제로 어떻게 움직이는가"라서 규칙별 테스트가 섞이지 않도록 파일을 나눴다.
import { readFileSync } from 'node:fs';

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { setRepositories } from '@/repositories/container';
import { createMemoryRepositories } from '@/repositories/memory/repositories';

import { DateStrip } from '@/features/date-strip/components/DateStrip';
import { useDateStripStore } from '@/features/date-strip/store/date-strip-store';

const TODAY = '2026-09-17';

/** `scrollIntoView` 는 jsdom 에 없다 — 호출 인자와 수신 요소를 보려고 직접 심는다. */
let scrollSpy: ReturnType<typeof vi.fn>;

/** `prefers-reduced-motion` 응답을 고정한다. `undefined` 면 matchMedia 자체를 없앤다. */
function setReducedMotion(reduce: boolean | undefined) {
  if (reduce === undefined) {
    Reflect.deleteProperty(window, 'matchMedia');
    return;
  }
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('prefers-reduced-motion: reduce') && reduce,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }),
  });
}

/** 렌더 후 요약 조회(비동기)까지 흘려보낸다. */
async function renderStrip() {
  const result = render(<DateStrip />);
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  return result;
}

/** 마지막 `scrollIntoView` 호출의 인자와 그 호출을 받은 셀의 접근성 이름. */
function lastScroll() {
  const index = scrollSpy.mock.calls.length - 1;
  const receiver = scrollSpy.mock.instances[index] as HTMLElement | undefined;
  return {
    options: scrollSpy.mock.calls[index]?.[0] as ScrollIntoViewOptions | undefined,
    name: receiver?.getAttribute('aria-label'),
  };
}

beforeEach(() => {
  scrollSpy = vi.fn();
  Object.defineProperty(Element.prototype, 'scrollIntoView', {
    configurable: true,
    writable: true,
    value: scrollSpy,
  });
  setRepositories(createMemoryRepositories());
  useDateStripStore.setState({ selectedDate: TODAY, today: TODAY });
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'scrollIntoView');
  setReducedMotion(undefined);
});

describe('§2-B. 좁은 화면에서는 가로 스크롤·스냅으로 선택 셀이 가운데 온다', () => {
  it('선택 셀을 가로 가운데로 스크롤한다(세로는 건드리지 않는다)', async () => {
    setReducedMotion(false);
    await renderStrip();
    expect(lastScroll().name).toBe('9월 17일 목요일, 오늘');
    expect(lastScroll().options).toMatchObject({ inline: 'center', block: 'nearest' });
  });

  it('선택이 바뀌면 새 선택 셀로 다시 가운데 맞춘다', async () => {
    setReducedMotion(false);
    await renderStrip();
    const before = scrollSpy.mock.calls.length;
    act(() => {
      useDateStripStore.getState().select('2026-09-20');
    });
    expect(scrollSpy.mock.calls.length).toBeGreaterThan(before);
    expect(lastScroll().name).toBe('9월 20일 일요일');
  });

  it('스냅 컨테이너와 셀의 스냅 지점이 실제로 선언돼 있다', async () => {
    setReducedMotion(false);
    await renderStrip();
    const group = screen.getByRole('radiogroup', { name: '날짜 선택' });
    expect(group.className).toContain('snap-x');
    expect(group.className).toContain('snap-mandatory');
    for (const cell of screen.getAllByRole('radio')) {
      expect(cell.className).toContain('snap-center');
    }
  });

  it('셀 간격은 어느 폭에서도 --space-2 이고 폭에 따라 벌어지지 않는다', async () => {
    setReducedMotion(false);
    await renderStrip();
    const group = screen.getByRole('radiogroup', { name: '날짜 선택' });
    expect(group.className).toContain('gap-[var(--space-2)]');
    // `justify-between` 은 남는 폭을 칸 사이로 나눠 간격을 스펙의 몇 배로 벌린다 (§2-A).
    expect(group.className).not.toContain('justify-between');
  });
});

describe('R10. 애니메이션은 120ms 이하이고 reduced-motion 에서는 없다', () => {
  it('모션을 줄이지 않는 환경에서는 부드럽게 스크롤한다', async () => {
    setReducedMotion(false);
    await renderStrip();
    expect(lastScroll().options).toMatchObject({ behavior: 'smooth' });
  });

  it('reduced-motion 이면 스크롤이 즉시 끝난다', async () => {
    setReducedMotion(true);
    await renderStrip();
    expect(lastScroll().options).toMatchObject({ behavior: 'auto' });
  });

  it('matchMedia 가 없는 런타임에서도 스크롤은 동작한다', async () => {
    setReducedMotion(undefined);
    await renderStrip();
    expect(lastScroll().options).toMatchObject({ inline: 'center' });
  });

  it('셀의 전환은 120ms 이하이고 150ms 짜리 --motion-fast 를 쓰지 않는다', async () => {
    setReducedMotion(false);
    await renderStrip();
    // 수치는 컴포넌트가 아니라 토큰에 산다(theme.md §3-D). 그래서 클래스에서 리터럴을 세지 않고
    // 참조한 토큰을 tokens.css 에서 되짚어 값을 확인한다 — 한쪽만 바뀌면 여기서 죽는다.
    const tokens = readFileSync('src/styles/tokens.css', 'utf8');
    for (const cell of screen.getAllByRole('radio')) {
      const referenced = [...cell.className.matchAll(/duration-\[var\((--motion-[\w-]+)\)\]/g)].map(
        (m) => m[1] as string,
      );
      expect(referenced.length).toBeGreaterThan(0);
      expect(cell.className).not.toMatch(/duration-\[\d+ms\]/);
      for (const token of referenced) {
        const declared = new RegExp(`\\${token}:\\s*(\\d+)ms`).exec(tokens);
        expect(declared, `${token} 이 tokens.css 에 없다`).not.toBeNull();
        expect(Number(declared?.[1])).toBeLessThanOrEqual(120);
      }
    }
  });

  it('셀의 전환·페이드 선언은 전부 motion-safe 뒤에 있어 reduce 에서는 적용되지 않는다', async () => {
    setReducedMotion(true);
    await renderStrip();
    // 헤더 버튼은 공용 프리미티브 소관이라 스트립(라디오 그룹) 안만 본다.
    const group = screen.getByRole('radiogroup', { name: '날짜 선택' });
    const animated = [...group.querySelectorAll<HTMLElement>('[class*="transition-"]')];
    expect(animated.length).toBeGreaterThan(0);
    for (const node of animated) {
      for (const token of node.className.split(/\s+/)) {
        if (/^(transition-|duration-|ease-)/.test(token)) {
          throw new Error(`motion-safe 없이 선언된 모션 클래스: ${token}`);
        }
      }
    }
  });

  it('모션을 실제로 죽이는 전역 킬스위치가 스타일에 남아 있다', () => {
    // 컴포넌트의 motion-safe 는 2중 안전장치이고, 모션을 실제로 0 으로 만드는 주체는 이 전역 규칙이다.
    // 여기가 사라지면 컴포넌트 밖의 모든 전환이 reduce 에서도 살아나므로 R10 이 깨진다.
    const globals = readFileSync('src/styles/globals.css', 'utf8');
    expect(globals).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(globals).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    const tokens = readFileSync('src/styles/tokens.css', 'utf8');
    expect(tokens).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    expect(tokens).toMatch(/--motion-fast:\s*0ms/);
  });
});
