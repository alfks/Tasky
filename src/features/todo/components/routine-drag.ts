// 관리 화면 순서 변경(routine.md R13)의 **루틴 쪽 어휘**. 인덱스 계산·중간점 판정은 투두·카테고리와 같은
// 계산이라 `@/lib/drag-order` 에 있고(`features/AGENTS.md` 규칙 5), 여기에는 이 화면에서만 뜻이 있는
// 두 가지만 둔다: 드래그의 MIME 과 낭독 문면. `category-drag.ts` 와 같은 꼴이다.

/**
 * 루틴 드래그임을 알리는 MIME. 투두(`TODO_DRAG_MIME`)·카테고리(`CATEGORY_DRAG_MIME`)와 **다른
 * 타입**이라 그쪽 드롭 대상(날짜 스트립·사이드바 행)이 이 드래그를 받지 않는다. Firefox 는 `setData`
 * 가 없으면 드래그를 시작조차 하지 않으므로 값 자체도 필요하다.
 */
export const ROUTINE_DRAG_MIME = 'application/x-tasky-routine-id';

/**
 * 순서가 바뀐 뒤 낭독할 문면(routine.md §5). 드래그와 `Alt+↑/↓` 가 **같은 함수**를 쓴다 — 같은 일을
 * 두 문장으로 말하면 같은 기능으로 들리지 않는다. `index` 는 0부터다.
 */
export function movedAnnouncement(title: string, index: number): string {
  return `${title} 루틴을 ${index + 1}번째로 옮겼어요`;
}
