// 애매하게 잘린 마지막 행을 보정한다. 자세한 사정은 `lib/scroll-clip-guard.ts` 머리주석.
import { useEffect } from 'react';
import type { RefObject } from 'react';

import { guardAmbiguousClip } from '@/features/shell/lib/scroll-clip-guard';

/**
 * `active`(=`showBottomAdd`, compact 폭)일 때만 건다 — 하단 막대가 없는 화면(≥768)은 이 애매함이
 * 생길 자리 자체가 없다. 마운트 시 한 번, 그리고 목록 내용이 바뀔 때마다(추가·완료 이동·삭제)
 * 다시 판정한다 — `MutationObserver` 로 본다(다른 셸 훅들과 같은 패턴, `top-notice.ts`·
 * `bottom-bar.ts`). 판정 자체가 "손대지 않은 자리(`scrollTop===0`)"로 좁혀져 있어(가드 함수 안),
 * 사용자가 이미 스크롤해 둔 자리를 다시 부르지 않는다.
 */
export function useGuardAmbiguousClip(ref: RefObject<HTMLElement | null>, active: boolean): void {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (el === null) return;
    guardAmbiguousClip(el);
    if (typeof MutationObserver !== 'function') return;
    const observer = new MutationObserver(() => guardAmbiguousClip(el));
    observer.observe(el, { childList: true, subtree: true });
    const onResize = (): void => guardAmbiguousClip(el);
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [ref, active]);
}
