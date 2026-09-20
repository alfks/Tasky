// 다이어리 카드 삭제 뒤 포커스 (app-shell R8·R14).
//
// 카테고리·투두의 `useRemovalReturnFocus`(`@/features/shell/hooks`)는 **여러 행 중 하나가 사라질
// 때**(다음 형제 → 이전 형제 → 목록 컨테이너)를 위한 것이다. 다이어리 카드는 한 장뿐이라 그 "행"
// 추상이 필요 없다 — 삭제되면 같은 자리에 `[+ 기록하기]` 버튼이 바로 나타난다.
//
// 그래도 가져오는 규칙 하나는 있다: **떠 있는 되돌리기 토스트가 있으면 그것이 첫 후보**라는 것
// (app-shell R8) — 접근성 리뷰가 카테고리 삭제에서 실측한 함정(토스트까지 Tab 29회, 수명 6,934ms)과
// 같은 이유다. 그 판정은 `@/lib/focus-fallback#toastActionButton` 단일 소스다(T-87, `src/lib/AGENTS.md`
// 규칙 5) — category·todo·calendar 가 이미 같은 함수를 쓴다.
import { toastActionButton } from '@/lib/focus-fallback';

/**
 * 삭제 직후 포커스를 옮긴다. 되돌리기 토스트의 버튼이 있으면 그리로, 없으면 `fallback`
 * (카드의 `[+ 기록하기]`)으로 — 어느 쪽도 없으면 아무 일도 하지 않는다(`<body>` 로 떨어뜨리지 않는다,
 * 호출자가 `fallback` 을 항상 준다면 이 마지막 경우는 일어나지 않는다).
 */
export function focusAfterDiaryRemoval(fallback: HTMLElement | null): void {
  (toastActionButton(document) ?? fallback)?.focus();
}
