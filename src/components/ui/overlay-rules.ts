import { isImeKey } from '@/lib/ime';

/**
 * 오버레이 프리미티브가 **함께 지키는 두 규칙**. 어느 한 컴포넌트의 것이 아니라 여기 모은다 —
 * `Dialog` 안에만 두었더니 `Popover` 안의 `<form>` 이 그대로 관통했다(리뷰 X1·X2 실측).
 */

/**
 * 모달이 배경을 `inert` 로 덮을 때 **비켜 가는** 포털 루트 표식.
 *
 * 토스트 뷰포트가 이 표식을 단다: 모달이 떠 있는 동안에도 토스트는 낭독돼야 하고 `[되돌리기]` 는
 * Tab 으로 닿아야 한다(app-shell §5 · R8). 카테고리 삭제 되돌리기(category R15)가 정확히
 * "대화상자를 닫자마자 뜨는 토스트" 경로라, 여기가 막히면 기능 자체가 성립하지 않는다.
 */
export const OVERLAY_ALWAYS_LIVE_ATTR = 'data-overlay-always-live';

/**
 * 오버레이 안에서 눌린 `Enter` 를 app-shell R14 대로 처리하고, 기본 동작을 막았으면 true.
 *
 * - 조합 중(`isComposing` 또는 `keyCode 229`)이면 무조건 막는다. Chromium 의 폼 암묵 제출은
 *   `isComposing` 을 보지 않아, 한글 확정 Enter 한 번이 파괴 버튼을 누른다(리뷰 B-1).
 * - 포커스가 버튼·링크에 있으면 "그 버튼만" 실행한다(기본 동작 유지).
 * - `textarea` 의 Enter 는 줄바꿈이다.
 * - 나머지(텍스트 입력 등)는 전부 막는다 — 폼 암묵 제출이 이 기본 동작을 타고 온다.
 */
export function applyOverlayEnterRule(e: KeyboardEvent): boolean {
  if (isImeKey(e)) {
    e.preventDefault();
    e.stopPropagation();
    return true;
  }
  const target = e.target;
  if (
    target instanceof HTMLButtonElement ||
    target instanceof HTMLAnchorElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return false;
  }
  e.preventDefault();
  return true;
}
