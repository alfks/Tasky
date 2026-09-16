// 토스트 뷰포트 겹침 방지 (app-shell.md R8).
//
// TODO(T-30): 이 파일은 **임시 조치**다. 옳은 해법은 뷰포트를 셸이 하나만 두고 feature 가 거기에
// 토스트를 밀어 넣는 것이고(`shell-toast-store.ts` 가 셸 쪽 절반), 나머지 절반 — `TodoList`·
// `CategoryRemoveDialog`·`BackupLauncher`·`PwaNotices` 에서 `ToastViewport` 를 걷어내는 일 — 은
// T-20 의 `owns` 밖이라 **T-30(토스트 단일 뷰포트)** 으로 넘어갔다. 그 티켓이 끝나면 이 파일을
// 통째로 지운다.
//
// **왜 그동안 이것이 필요한가.** `ToastViewport` 는 `document.body` 로 포털되는 `position: fixed;
// bottom: var(--space-6)` 컨테이너다. 넷이 같은 좌표라 둘이 동시에 뜨면 완전히 포개진다(리뷰 실측:
// 둘 다 top 633 / bottom 688, `[되돌리기]` 두 개가 겹쳐 어느 쪽이 눌리는지 알 수 없다).
//
// **뷰포트 루트에 `style` prop 이 없다는 성질**에 기댄다 — React 는 자기가 주지 않은 인라인 스타일을
// 다시 쓰지 않으므로 밖에서 `style.bottom` 을 넣어도 다음 렌더에 지워지지 않는다.
import { OVERLAY_ALWAYS_LIVE_ATTR } from '@/components/ui/overlay-rules';

/** 뷰포트 사이 간격. `--space-2`(8px) 와 같은 값이다. */
export const TOAST_STACK_GAP_PX = 8;

/** 이 모듈이 인라인 스타일을 넣은 뷰포트를 표시한다 — 정리할 때 그것만 되돌린다. */
export const TOAST_STACK_ATTR = 'data-shell-toast-stacked';

/** 하단 고정 막대(좁은 화면의 `[+ 할 일]`). 토스트가 이 위로 비켜 가야 라벨을 가리지 않는다. */
export const BOTTOM_BAR_SELECTOR = '[data-shell-bottom-bar]';

function viewportsOf(doc: Document): HTMLElement[] {
  return Array.from(doc.body.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && el.hasAttribute(OVERLAY_ALWAYS_LIVE_ATTR),
  );
}

/** 뷰포트가 지금 토스트를 하나라도 담고 있는가. 빈 라이브 영역은 자리를 차지하지 않아야 한다. */
function hasToasts(viewport: HTMLElement): boolean {
  return Array.from(viewport.children).some((region) => region.childElementCount > 0);
}

/**
 * 토스트가 피해야 할 화면 아래쪽 높이(px). 지금은 하단 고정 `[+ 할 일]` 막대 하나다 —
 * 400px 에서 토스트(721~768)가 버튼 라벨(744~780)을 가렸다(리뷰 실측).
 */
export function bottomReservedPx(doc: Document): number {
  const bar = doc.querySelector(BOTTOM_BAR_SELECTOR);
  if (!(bar instanceof HTMLElement)) return 0;
  const height = Math.round(bar.getBoundingClientRect().height);
  return height <= 0 ? 0 : height + TOAST_STACK_GAP_PX;
}

/**
 * 지금 떠 있는 뷰포트들을 아래에서 위로 쌓는다. 돌려주는 수는 **토스트를 담은** 뷰포트 개수다
 * (테스트가 "둘이 동시에 떴다" 를 이 수로 판정한다).
 */
export function restackToastViewports(doc: Document): number {
  let offset = bottomReservedPx(doc);
  let stacked = 0;
  for (const viewport of viewportsOf(doc)) {
    if (!hasToasts(viewport)) {
      viewport.style.removeProperty('bottom');
      viewport.removeAttribute(TOAST_STACK_ATTR);
      continue;
    }
    stacked += 1;
    if (offset === 0) {
      viewport.style.removeProperty('bottom');
      viewport.removeAttribute(TOAST_STACK_ATTR);
    } else {
      viewport.style.bottom = `calc(var(--space-6) + ${offset}px)`;
      viewport.setAttribute(TOAST_STACK_ATTR, '');
    }
    offset += viewport.getBoundingClientRect().height + TOAST_STACK_GAP_PX;
  }
  return stacked;
}

/**
 * body 아래 트리의 변화를 보고 쌓임을 다시 계산한다. `style` 만 바꾸므로 관찰 대상(childList)을
 * 건드리지 않는다 — 되먹임 고리가 생기지 않는다. 계산은 다음 프레임으로 모아 한 번만 한다(같은
 * 커밋에서 여러 변경이 와도 동기 레이아웃을 한 번만 강제한다).
 */
export function observeToastViewports(doc: Document): () => void {
  restackToastViewports(doc);
  if (typeof MutationObserver !== 'function') return () => {};

  let frame: number | null = null;
  const schedule = (): void => {
    if (frame !== null) return;
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    if (raf === null) {
      restackToastViewports(doc);
      return;
    }
    frame = raf(() => {
      frame = null;
      restackToastViewports(doc);
    });
  };

  const observer = new MutationObserver(schedule);
  observer.observe(doc.body, { childList: true, subtree: true });
  window.addEventListener('resize', schedule);
  return () => {
    observer.disconnect();
    window.removeEventListener('resize', schedule);
    if (frame !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(frame);
    for (const viewport of viewportsOf(doc)) {
      viewport.style.removeProperty('bottom');
      viewport.removeAttribute(TOAST_STACK_ATTR);
    }
  };
}
