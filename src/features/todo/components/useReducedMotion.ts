// `prefers-reduced-motion` 구독 (theme.md §3-D R5, todo.md R8 의 "reduced-motion: 대기 없이 즉시 재배치").
//
// CSS 토큰만으로는 부족하다: R8 의 400ms 대기와 FLIP 은 JS 가 결정하므로 값을 직접 읽어야 한다.
// 토큰(`--motion-*` 0ms)은 transition 길이를 0 으로 만들 뿐, "기다렸다가 옮긴다" 는 없애지 못한다.
import { useSyncExternalStore } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

/** `matchMedia` 가 없는 런타임(구형 브라우저·jsdom)에서는 "선호하지 않음" 으로 본다. */
function query(): MediaQueryList | undefined {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
  return window.matchMedia(QUERY);
}

function subscribe(onChange: () => void): () => void {
  const media = query();
  if (media === undefined) return () => undefined;
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

/** OS 설정을 실시간으로 따른다 — 설정을 바꾸고 새로고침해야 반영되면 접근성 설정으로서 값이 없다. */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => query()?.matches ?? false,
    () => false,
  );
}
