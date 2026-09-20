// 카테고리 삭제가 끝난 뒤 포커스가 갈 곳 (app-shell.md R14 · R8).
//
// `CategoryRemoveDialog` 에 `returnFocus` 를 주지 않으면 `Dialog` 는 사라진 앵커를 보고 `null` 을
// 얻어 포커스가 `<body>` 로 떨어진다 — 접근성 리뷰가 2/2 재현한 자리다. 같은 경로의 투두 삭제는
// `TodoList` 가 `returnFocus` 를 주고 있어 정상이다. 여기서 카테고리 쪽 몫을 채운다.
import { useRef } from 'react';

import {
  focusAfterRowRemoval,
  rowAnchorOf,
  toastActionButton,
  type RowAnchor,
} from '@/lib/focus-fallback';

export type RemovalReturnFocus = {
  /** `⋯ → 삭제` 를 누른 순간 호출한다 — 아직 살아 있는 행에서 자리표를 뜬다. */
  capture: () => void;
  /** `Dialog` 가 "앵커가 사라졌다" 고 물을 때의 답. */
  returnFocus: () => HTMLElement | null;
};

export type UseRemovalReturnFocusOptions = {
  /**
   * 삭제가 **자기 되돌리기 토스트를 띄우는 경로에서만** `true` 로 둔다. 기본값 `true`(카테고리·
   * 투두처럼 삭제 직후 `[되돌리기]` 토스트가 뜨는 경로, 아래 본문 참고). 그런 삭제가 없는 호출부
   * (예: 루틴 삭제, routine.md R10 — 되돌리기 토스트가 없다)는 `false` 를 줘야 한다: 안 주면
   * **이 삭제와 무관한, 화면에 우연히 떠 있는 다른 토스트**(등록 성공 등)의 버튼을 첫 후보로
   * 집어 버린다(리뷰 #104 Major 실측 — 등록 토스트 `[되돌리기]`가 떠 있는 동안 루틴을 지우면
   * 포커스가 그 토스트로 가고, 거기서 `Enter` 를 누르면 루틴 삭제가 아니라 **엉뚱한 등록을
   * 되돌린다** — 파괴적이다).
   */
  preferToast?: boolean;
};

export function useRemovalReturnFocus(
  options: UseRemovalReturnFocusOptions = {},
): RemovalReturnFocus {
  const { preferToast = true } = options;
  const anchor = useRef<RowAnchor | null>(null);

  return {
    capture: () => {
      anchor.current = rowAnchorOf(document.activeElement);
    },
    returnFocus: () => {
      /*
       * **되돌리기 토스트가 있으면 그것이 첫 후보다 — 단, `preferToast` 가 참일 때만.**
       *
       * R14 의 문면은 "다음 형제 → 이전 형제 → 목록 컨테이너" 이고 아래 `focusAfterRowRemoval` 이
       * 그대로 한다. 그런데 카테고리 삭제는 닫히는 즉시 `[되돌리기]` 토스트가 뜨는 경로이고(R15),
       * 그 토스트는 `document.body` 맨 끝 포털이라 Tab 순서의 맨 끝이다 — 접근성 리뷰 실측으로
       * **Tab 29회**, 토스트 수명은 6,934ms. 키보드만 쓰는 사용자에게는 없는 기능이었다(R8 위반).
       *
       * 방금 사용자가 실행한 파괴 동작을 되돌리는 컨트롤이고, 포커스가 들어오면 `Toast` 가 자동
       * 닫힘 타이머를 멈추므로(R8) 6초 제한도 함께 풀린다. 되돌릴 것이 없으면(액션 없는 토스트)
       * 아래 R14 순서로 떨어진다.
       */
      const toast = preferToast ? toastActionButton(document) : null;
      return toast ?? focusAfterRowRemoval(anchor.current);
    },
  };
}
