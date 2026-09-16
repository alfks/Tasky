// 100% 보상(R4)과 낭독 디바운스(§5).
//
// 펄스는 Web Animations API 로 만들므로 `Element.prototype.animate` 를 스파이로 바꿔 센다.
// jsdom 에는 그 메서드가 없어 스파이를 심지 않으면 훅이 조용히 건너뛴다 — 그래서 "호출되지
// 않았다" 단언은 스파이가 실제로 심긴 상태에서만 의미가 있다.
import { StrictMode } from 'react';

import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  useCompletionAnnouncement,
  useCompletionPulse,
} from '@/features/stats/hooks/useCompletionPulse';

const animate = vi.fn((_keyframes: Keyframe[], options: KeyframeAnimationOptions) => {
  void options;
  return { cancel: vi.fn() };
});

function Probe({ rate }: { rate: number | null }) {
  const ref = useCompletionPulse<HTMLSpanElement>(rate);
  return <span ref={ref} data-testid="ring" />;
}

/** `matches` 를 그대로 돌려주는 최소 `matchMedia`. jsdom 기본값에는 이 API 가 없다. */
function stubMatchMedia(matches: boolean): void {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    }),
  });
}

beforeEach(() => {
  animate.mockClear();
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: animate,
  });
});

afterEach(() => {
  Reflect.deleteProperty(Element.prototype, 'animate');
  Reflect.deleteProperty(window, 'matchMedia');
});

describe('useCompletionPulse (R4)', () => {
  it('열었을 때 이미 100%면 펄스하지 않는다', () => {
    render(<Probe rate={1} />);

    expect(animate).not.toHaveBeenCalled();
  });

  it('StrictMode 가 effect 를 두 번 돌려도 로드 시 100%는 펄스하지 않는다', () => {
    // StrictMode 의 두 번째 실행에서는 직전 값이 이미 1이다 — "직전 값 < 1" 이 느슨해지면 여기서 샌다.
    render(
      <StrictMode>
        <Probe rate={1} />
      </StrictMode>,
    );

    expect(animate).not.toHaveBeenCalled();
  });

  it('1 미만에서 1이 되는 순간 400ms 펄스를 한 번 만든다', () => {
    const { rerender } = render(<Probe rate={0.5} />);
    rerender(<Probe rate={1} />);

    expect(animate).toHaveBeenCalledTimes(1);
    expect(animate.mock.calls[0][1]).toMatchObject({ duration: 400 });
  });

  it('100%가 이어지는 동안에는 다시 펄스하지 않는다', () => {
    const { rerender } = render(<Probe rate={0.5} />);
    rerender(<Probe rate={1} />);
    rerender(<Probe rate={1} />);

    expect(animate).toHaveBeenCalledTimes(1);
  });

  it('100%에서 내려갔다 다시 올라오면 또 펄스한다', () => {
    const { rerender } = render(<Probe rate={0.5} />);
    rerender(<Probe rate={1} />);
    rerender(<Probe rate={0.75} />);
    rerender(<Probe rate={1} />);

    expect(animate).toHaveBeenCalledTimes(2);
  });

  it('투두 0개(비율 없음)에서 100%로 바뀌는 것은 "직전 값 < 1"이 아니라 펄스가 없다', () => {
    const { rerender } = render(<Probe rate={null} />);
    rerender(<Probe rate={1} />);

    expect(animate).not.toHaveBeenCalled();
  });

  it('prefers-reduced-motion: reduce 면 펄스하지 않는다', () => {
    stubMatchMedia(true);
    const { rerender } = render(<Probe rate={0.5} />);
    rerender(<Probe rate={1} />);

    expect(animate).not.toHaveBeenCalled();
  });

  it('모션 축소를 끄면 같은 전이에서 펄스한다', () => {
    stubMatchMedia(false);
    const { rerender } = render(<Probe rate={0.5} />);
    rerender(<Probe rate={1} />);

    expect(animate).toHaveBeenCalledTimes(1);
  });
});

describe('useCompletionAnnouncement (§5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('첫 렌더에서는 라이브 영역 내용이 처음부터 그 문구라 낭독이 생기지 않는다', () => {
    const { result } = renderHook(() => useCompletionAnnouncement('달성률 60%'));

    expect(result.current).toBe('달성률 60%');
  });

  it('값이 바뀌면 300ms 뒤에 반영된다', () => {
    const { result, rerender } = renderHook(
      ({ message }: { message: string }) => useCompletionAnnouncement(message),
      { initialProps: { message: '달성률 60%' } },
    );

    rerender({ message: '달성률 80%' });
    expect(result.current).toBe('달성률 60%');

    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('달성률 80%');
  });

  it('연타하면 마지막 값 하나만 남는다', () => {
    const { result, rerender } = renderHook(
      ({ message }: { message: string }) => useCompletionAnnouncement(message),
      { initialProps: { message: '달성률 20%' } },
    );

    rerender({ message: '달성률 40%' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ message: '달성률 60%' });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('달성률 20%');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('달성률 60%');
  });
});
