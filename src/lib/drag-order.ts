// 드래그로 목록 순서를 바꿀 때의 **좌표 계산**. DOM 도 feature 어휘도 모른다 — 인자는 문자열 id
// 수열과 숫자뿐이다(`lib/AGENTS.md` "무엇이 여기 올라오는가" 세 조건).
//
// 두 feature 가 같은 계산을 쓴다: todo 본문 목록(`features/todo/components/todo-drag.ts` 가
// 완료 항목 규칙을 덧붙여 감싼다)과 category 사이드바(`features/category/components/category-drag.ts`).
// 원래 todo 안에 있던 것을 두 번째 사용처가 생기면서 올렸다(`features/AGENTS.md` 규칙 5).

/** 행의 세로 중간을 넘겼는가 — 넘겼으면 그 행 **뒤**로 넣는다. */
export function isAfterMidpoint(rect: { top: number; height: number }, clientY: number): boolean {
  return clientY > rect.top + rect.height / 2;
}

/**
 * `overId` 행의 앞/뒤로 `draggedId` 를 넣을 때의 목표 인덱스.
 *
 * `reorder(id, targetIndex)` 류의 저장 함수는 수열에서 항목을 **빼낸 뒤의** 인덱스를 받으므로
 * 그 좌표로 돌려준다. 같은 항목 위이거나 둘 중 하나가 수열에 없으면 `null` = 드롭을 받지 않는다.
 * 호출부는 `null` 을 받으면 아무것도 저장하지 않는다 — 거절한 드롭에 대해 할 말이 없기 때문에
 * 오류로 올리지 않는다.
 */
export function moveTargetIndex(
  sequence: readonly string[],
  draggedId: string,
  overId: string,
  after: boolean,
): number | null {
  if (draggedId === overId) return null;
  const from = sequence.indexOf(draggedId);
  const over = sequence.indexOf(overId);
  if (from === -1 || over === -1) return null;
  // 끌고 있는 항목을 먼저 빼면 그 뒤의 인덱스가 하나씩 당겨진다.
  const shifted = over > from ? over - 1 : over;
  return shifted + (after ? 1 : 0);
}
