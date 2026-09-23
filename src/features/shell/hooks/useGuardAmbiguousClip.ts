// 애매하게 잘린 마지막 행을 보정한다. 자세한 사정은 `lib/scroll-clip-guard.ts` 머리주석.
import { useEffect } from 'react';
import type { RefObject } from 'react';

import { ambiguousClipPx, guardAmbiguousClip } from '@/features/shell/lib/scroll-clip-guard';

/**
 * `active`(=`showBottomAdd`, compact 폭)일 때만 건다 — 하단 막대가 없는 화면(≥768)은 이 애매함이
 * 생길 자리 자체가 없다.
 *
 * **왜 한 주기에 한 번만 보정하는가(리뷰 Minor — 최종 리뷰 실측).** 예전에는 목록이 바뀔 때마다
 * (`MutationObserver` 의 `childList` 콜백마다) 매번 다시 판정했다. 그런데 가드 함수 자체는
 * `scrollTop===0` 일 때만 판정하므로, 사용자가 **한 번 보정된 뒤 일부러 다시 맨 위로 스크롤을
 * 올리면** 그 순간 `scrollTop` 이 다시 0 이 되고, 그 상태에서 체크·추가·삭제(=`childList` 변경)를
 * 할 때마다 최대 `--control-height` 만큼 스크롤이 다시 아래로 튀었다 — 코드가 스크롤 위치를 임의로
 * 움직이는 장치라 체감 위험이 가장 큰 버그였다. 그래서 **실제로 스크롤을 밀어낸(=진짜 클립을
 * 찾아 보정한) 뒤에는** 같은 주기 동안 다시 밀지 않는다(`corrected` 플래그). 반대로 아직 한 번도
 * 보정한 적이 없다면(예: 데이터가 비동기로 아직 로딩 중이라 첫 판정이 clip=0 으로 끝난 경우) 계속
 * 지켜본다 — 그래야 실제 목록이 나중에 붙는 순간의 진짜 클립을 놓치지 않는다. clip=0 인 채로
 * 반복 판정하는 것 자체는 안전하다 — `scrollTop` 을 옮기지 않으니 튈 일이 없다.
 *
 * **주기의 경계는 `active` 전환과 `resetKey`(선택 날짜) 다.** `active` 가 꺼졌다 켜지면(≥768 ↔
 * <768 을 오가는 리사이즈) 이펙트가 다시 걸린다 — 화면 자체가 다시 마운트되는 것과 같은 새 판정
 * 계기다. `resetKey` 로 선택 날짜를 받아 **날짜가 바뀌면**(목록이 통째로 다른 날짜 것으로 바뀐다,
 * 지적 사항이 든 예) 같은 이유로 다시 판정한다 — 반면 **같은 날짜 안에서의** 체크·추가·삭제는
 * 이미 판정이 끝난 자리를 다시 흔들 이유가 없다(바로 위 문단이 고치는 버그 그 자체).
 */
export function useGuardAmbiguousClip(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  resetKey?: unknown,
): void {
  useEffect(() => {
    if (!active) return;
    const el = ref.current;
    if (el === null) return;

    let corrected = false;
    const run = (): void => {
      if (corrected) return;
      if (ambiguousClipPx(el) > 0) {
        guardAmbiguousClip(el);
        corrected = true;
      }
    };
    run();
    if (typeof MutationObserver !== 'function') return;
    const observer = new MutationObserver(run);
    observer.observe(el, { childList: true, subtree: true });
    const onResize = (): void => run();
    window.addEventListener('resize', onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', onResize);
    };
  }, [ref, active, resetKey]);
}
