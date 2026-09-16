// 토스트가 하단 고정 막대를 덮지 않게 비워 두는 자리 (app-shell.md R8).
//
// **T-20 의 임시 조치는 사라졌다.** 그때 이 파일은 뷰포트 넷을 찾아 각각의 `style.bottom` 을 다시
// 계산해 쌓았고(겹침 방지), 그것이 성립하려면 "`ToastViewport` 루트에 `style` prop 이 없다" 는
// `Toast.tsx` 의 구현 세부가 참이어야 했다 — 깨져도 조용한 결합이었다(PR #33 리뷰). 이제 뷰포트가
// 하나뿐이라(`ShellToasts`) **쌓을 것이 없고**, 남의 요소에 좌표를 써 넣지도 않는다.
//
// 남은 몫은 하나다: 폭 <768 에서 `[+ 할 일]` 막대가 화면 아래를 차지하는 동안 토스트가 그 위로
// 비켜 가야 한다(리뷰 실측: 400px 에서 토스트 721~768 이 버튼 라벨 744~780 을 가렸다). 순수 CSS 로
// 쓰려면 막대의 높이 공식(버튼 높이 + 패딩 + 테두리)을 여기에 베껴야 하고, 그러면 막대의 패딩이
// 바뀌는 날 조용히 어긋난다. 그래서 `top-notice.ts` 와 같은 방식을 쓴다 — **그려진 것을 재서**
// 문서 루트의 CSS 변수 하나로 올리고, 위치는 `Toast.tsx` 가 자기 클래스 안에서 계산한다.
// 남의 인라인 스타일을 건드리지 않으므로 React 의 렌더와 부딪히지 않는다.
//
// 막대를 **이름이 아니라 표식으로** 찾는다(`ShellMain` 의 `BOTTOM_BAR_ATTR`) — 문구가 바뀌어도
// 그대로다. 배선(이 모듈이 실제로 셸 수명에 걸려 있는가)은 `components/ShellToasts.test.tsx` 가 잰다.

/** 막대와 토스트 사이 숨. `--space-2`(8px) 와 같은 값이다. */
export const TOAST_STACK_GAP_PX = 8;

/** `Toast.tsx` 의 뷰포트가 `bottom` 계산에 쓰는 변수. 두 파일이 공유하는 유일한 접점이다. */
export const TOAST_BOTTOM_RESERVE_VAR = '--toast-bottom-reserve';

/** 하단 고정 막대(좁은 화면의 `[+ 할 일]`). 표식의 단일 소스는 `ShellMain.BOTTOM_BAR_ATTR`. */
export const BOTTOM_BAR_SELECTOR = '[data-shell-bottom-bar]';

/**
 * 토스트가 피해야 할 화면 아래쪽 높이(px). 막대가 없으면 0.
 */
export function bottomReservedPx(doc: Document): number {
  const bar = doc.querySelector(BOTTOM_BAR_SELECTOR);
  if (!(bar instanceof HTMLElement)) return 0;
  const height = Math.round(bar.getBoundingClientRect().height);
  return height <= 0 ? 0 : height + TOAST_STACK_GAP_PX;
}

/**
 * 잰 값을 문서 루트에 올린다. 돌려주는 수는 올린 px 이다(테스트가 이 수로 판정한다).
 *
 * 0 일 때는 변수를 **지운다** — 남겨 두면 `calc()` 가 `0px` 을 더하며 도는 대신 아예 기본값 경로를
 * 타게 하는 편이 개발 도구에서 "지금 비워 둔 자리가 없다" 를 그대로 보여 준다.
 */
export function publishBottomReserve(doc: Document): number {
  const px = bottomReservedPx(doc);
  const root = doc.documentElement;
  if (px === 0) root.style.removeProperty(TOAST_BOTTOM_RESERVE_VAR);
  else root.style.setProperty(TOAST_BOTTOM_RESERVE_VAR, `${px}px`);
  return px;
}

/**
 * 막대가 뜨고 지는 것을 보고 비워 둘 자리를 다시 알린다.
 *
 * 이름이 `observe*Viewports` 인 것은 호출부(`hooks/useToastStack.ts`)가 이 티켓의 `owns` 밖이라
 * 함께 고칠 수 없었기 때문이다 — 하는 일은 뷰포트가 아니라 **막대**를 보는 것이다.
 *
 * 계산은 다음 프레임으로 모아 한 번만 한다(같은 커밋에서 여러 변경이 와도 동기 레이아웃을 한 번만
 * 강제한다). 관찰 대상은 `childList` 인데 이 모듈은 `style` 만 바꾸므로 되먹임 고리가 없다.
 */
export function observeToastViewports(doc: Document): () => void {
  publishBottomReserve(doc);
  if (typeof MutationObserver !== 'function') return () => {};

  let frame: number | null = null;
  const schedule = (): void => {
    if (frame !== null) return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    if (raf === null) {
      publishBottomReserve(doc);
      return;
    }
    frame = raf(() => {
      frame = null;
      publishBottomReserve(doc);
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', schedule);
    if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    doc.documentElement.style.removeProperty(TOAST_BOTTOM_RESERVE_VAR);
  };
}
