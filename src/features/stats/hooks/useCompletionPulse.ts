// 100% 보상(R4)과 낭독 디바운스(§5). 둘 다 "값이 바뀐 순간"만 보는 훅이라 한 파일에 둔다.
import { type RefObject, useEffect, useRef, useState } from 'react';

/**
 * 펄스 1회 길이. completion-rate.md R4 가 400ms 를 직접 정했고 theme §3-D 모션 토큰
 * (150·200·300ms)에는 대응하는 값이 없어 규칙 값을 그대로 쓴다.
 */
const PULSE_MS = 400;

/** theme.md §3-D `--motion-ease` 와 같은 값. Web Animations API 는 CSS 변수를 읽지 못한다. */
const PULSE_EASING = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const PULSE_KEYFRAMES: Keyframe[] = [
  { transform: 'scale(1)' },
  { transform: 'scale(1.08)' },
  { transform: 'scale(1)' },
];

/** 토글 연타 시 낭독을 한 번으로 모으는 간격 (§5). */
const ANNOUNCE_DEBOUNCE_MS = 300;

/** `prefers-reduced-motion: reduce` 면 펄스를 아예 만들지 않는다 (R4, theme §3-D R5). */
function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * 직전 값이 1 미만이었다가 1이 된 순간인가 (R4). 첫 렌더는 `before === undefined` 라 걸리지
 * 않는다 — 페이지를 열었을 때 이미 100% 면 문구만 나오고 펄스는 없다.
 */
function reachedFull(before: number | null | undefined, rate: number | null): boolean {
  return before !== undefined && before !== null && before < 1 && rate === 1;
}

/**
 * 100% 도달 순간에 대상 요소를 한 번 펄스시킨다 (R4). 돌려준 ref 를 펄스할 요소에 붙인다.
 *
 * CSS 키프레임 대신 Web Animations API 를 쓰는 이유: 전역 CSS 는 `src/styles/` 한 곳에만 두는
 * 규약(code-style §6)이라 feature 가 키프레임을 더할 자리가 없다. `animate` 가 없는 런타임
 * (jsdom 기본값 등)에서는 조용히 건너뛴다 — 펄스는 장식이라 없어도 정보가 빠지지 않는다.
 */
export function useCompletionPulse<E extends HTMLElement>(
  rate: number | null,
): RefObject<E | null> {
  const target = useRef<E | null>(null);
  const previous = useRef<number | null | undefined>(undefined);

  useEffect(() => {
    const before = previous.current;
    previous.current = rate;
    const element = target.current;
    if (!reachedFull(before, rate) || prefersReducedMotion() || element === null) {
      return undefined;
    }
    if (typeof element.animate !== 'function') {
      return undefined;
    }
    const animation = element.animate(PULSE_KEYFRAMES, {
      duration: PULSE_MS,
      easing: PULSE_EASING,
    });
    return () => {
      animation.cancel();
    };
  }, [rate]);

  return target;
}

/**
 * `aria-live` 영역에 넣을 문구를 300ms 디바운스한다 (§5). 첫 렌더에서는 상태 초기값이 이미
 * 같은 문구라 DOM 이 바뀌지 않는다 — 페이지 로드만으로 낭독되지 않게 하려는 것이다.
 */
export function useCompletionAnnouncement(message: string): string {
  const [announced, setAnnounced] = useState(message);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAnnounced(message);
    }, ANNOUNCE_DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [message]);

  return announced;
}
