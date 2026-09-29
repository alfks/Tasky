import { afterEach, describe, expect, it, vi } from 'vitest';

import { fadeInClass, scheduleFadeEnd } from '@/features/date-strip/lib/fade';

describe('R19. fadeInClass — 0 은 전환 없이 그리고, 1 로만 전환한다', () => {
  it('페이드 중에는 transition-none + opacity-0 이 둘 다 motion-safe: 뒤에 있다', () => {
    const classes = fadeInClass(true).split(' ');
    expect(classes).toContain('motion-safe:transition-none');
    expect(classes).toContain('motion-safe:opacity-0');
    expect(classes).not.toContain('opacity-0');
    expect(classes.some((c) => c.includes('transition-opacity'))).toBe(false);
  });

  it('끝나면 opacity-100 + --motion-xfast 전환이고 리터럴 ms 가 없다', () => {
    const classes = fadeInClass(false);
    expect(classes).toContain('opacity-100');
    expect(classes).toContain('motion-safe:transition-opacity');
    expect(classes).toContain('motion-safe:duration-[var(--motion-xfast)]');
    expect(classes).not.toMatch(/duration-\[\d+ms\]/);
  });
});

describe('scheduleFadeEnd — 끝은 두 번째 프레임, 취소하면 부르지 않는다', () => {
  afterEach(() => vi.restoreAllMocks());

  it('rAF 두 번 뒤에 end 를 한 번 부른다', () => {
    const queue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => queue.push(cb));
    const end = vi.fn();
    scheduleFadeEnd(end);
    queue.shift()?.(0);
    expect(end).not.toHaveBeenCalled();
    queue.shift()?.(0);
    expect(end).toHaveBeenCalledTimes(1);
  });

  it('취소하면 두 프레임 어느 쪽도 남지 않는다', () => {
    const queue: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => queue.push(cb));
    const cancel = vi.spyOn(window, 'cancelAnimationFrame');
    const end = vi.fn();
    scheduleFadeEnd(end)();
    expect(cancel).toHaveBeenCalledTimes(2);
    queue.forEach((cb) => cb(0));
    // 취소가 진짜로 먹었는지는 브라우저 몫이라 여기서는 호출 수만 고정한다.
    expect(cancel.mock.calls[0]?.[0]).toBe(1);
  });
});
