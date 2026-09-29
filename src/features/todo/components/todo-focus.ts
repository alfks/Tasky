// 목록 DOM 의 **표식 두 개**와, 삭제·메뉴 닫기 뒤 포커스를 어디로 보낼지 (app-shell R14, todo.md §5).
//
// 포커스가 `<body>` 로 떨어지면 키보드 사용자는 Tab 을 목록 처음부터 다시 눌러야 한다. 그래서
// 사라진 행 대신 **다음 형제 → 이전 형제 → 목록 컨테이너** 순으로 받을 곳을 정해 둔다.
//
// 표식이 여기 있는 이유: 행을 찾는 쪽(FLIP·포커스 복원·형제 탐색)이 셋이라, 정의를 그 중 하나에
// 두면 나머지가 그 모듈을 거꾸로 import 하게 된다(실제로 순환이 났다). 표식만 담은 이 자리가
// 의존의 바닥이다 — 여기서는 아무것도 import 하지 않는다.

/** 행을 찾는 표식. `id` 가 아니라 전용 속성인 이유는 목록 밖 요소를 잡지 않기 위해서다. */
export const FLIP_ATTR = 'data-flip-id';

/** 목록 컨테이너가 스스로 포커스를 받을 수 있게 다는 표식. 포커스가 여기로 오면 접근 이름(`TODO_MESSAGES.listLabel`)이 읽힌다. */
export const LIST_FOCUS_ATTR = 'data-todo-list';

function rowSibling(row: Element, direction: 'next' | 'previous'): HTMLElement | null {
  let sibling = direction === 'next' ? row.nextElementSibling : row.previousElementSibling;
  while (sibling !== null) {
    if (sibling instanceof HTMLElement && sibling.hasAttribute(FLIP_ATTR)) return sibling;
    sibling = direction === 'next' ? sibling.nextElementSibling : sibling.previousElementSibling;
  }
  return null;
}

/**
 * `row` 가 사라진 뒤 포커스를 받을 요소. 셋 다 없으면 `null` 이고, 호출부는 그때만 포기한다.
 *
 * 형제를 `nextElementSibling` 으로 한 칸만 보지 않고 훑는 이유: 목록에는 구분선("완료 n")과
 * 입력 행이 섞여 있어서 바로 옆 형제가 행이 아닐 수 있다.
 */
export function focusFallback(row: HTMLElement | null): HTMLElement | null {
  if (row === null) return null;
  const forward = rowSibling(row, 'next');
  if (forward !== null) return forward;
  const backward = rowSibling(row, 'previous');
  if (backward !== null) return backward;
  return row.closest<HTMLElement>(`[${LIST_FOCUS_ATTR}]`);
}
