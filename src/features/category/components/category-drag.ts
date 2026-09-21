// 사이드바 순서 변경(category R5)의 **카테고리 쪽 어휘**. 인덱스 계산·중간점 판정은 투두 목록과
// 같은 계산이라 `@/lib/drag-order` 에 있고(`features/AGENTS.md` 규칙 5), 여기에는 이 화면에서만
// 뜻이 있는 두 가지만 둔다: 드래그의 MIME 과 낭독 문면.

/**
 * 카테고리 드래그임을 알리는 MIME. 투두(`TODO_DRAG_MIME`)와 **다른 타입**이라, 날짜 스트립처럼
 * 투두만 받는 드롭 대상 위를 지나가도 그쪽이 이 드래그를 받지 않는다. Firefox 는 `setData` 가
 * 없으면 드래그를 시작조차 하지 않으므로 값 자체도 필요하다.
 */
export const CATEGORY_DRAG_MIME = 'application/x-tasky-category-id';

/**
 * 순서가 바뀐 뒤 낭독할 문면 (§5 "드래그 대안 `Alt+↑/↓` + 낭독"). 드래그와 키보드가 **같은 함수**를
 * 쓴다 — 같은 일을 두 문장으로 말하면 같은 기능으로 들리지 않는다. `index` 는 0부터다.
 */
export function movedAnnouncement(name: string, index: number): string {
  return `${name} 을(를) ${index + 1}번째로 옮겼어요`;
}
