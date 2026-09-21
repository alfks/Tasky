// 드래그·키보드 순서 변경의 **좌표 계산**(todo.md R11). DOM 을 읽지 않는 순수 함수만 둔다 —
// 드롭 좌표는 실제 브라우저에서만 나오지만, "어느 인덱스로 보낼 것인가" 는 그 없이도 고정할 수 있다.
//
// 좌표계는 `TodoGroup.sequence`(완료 포함, order 오름차순) 하나다. `reorder(id, targetIndex)` 가
// 그 수열에서 항목을 빼고 `targetIndex` 에 다시 꽂으므로, **빼낸 뒤의** 인덱스를 줘야 한다.
//
// 인덱스 계산 자체와 중간점 판정은 카테고리 사이드바도 쓰므로 `@/lib/drag-order` 에 있다
// (`features/AGENTS.md` 규칙 5). 여기 남는 것은 **완료 항목 규칙**(todo 어휘)뿐이다.
import { moveTargetIndex } from '@/lib/drag-order';

export { isAfterMidpoint } from '@/lib/drag-order';

/** 수열 계산에 필요한 최소 모양. 테스트가 `Todo` 전체를 만들지 않아도 되게 좁혀 둔다. */
export type DragSlot = { readonly id: string; readonly done: boolean };

/**
 * `overId` 행의 앞/뒤로 `draggedId` 를 넣을 때의 `targetIndex` (R11).
 *
 * 드롭을 받지 않는 경우는 전부 `null` 이다: 같은 항목 위, 수열 밖(다른 그룹), **완료 항목 위**
 * (완료 항목은 드롭 대상이 아니다), 끌고 있는 항목이 완료인 경우(순서 변경 대상이 아니다).
 * `null` 을 받은 호출부는 아무것도 저장하지 않는다 — 도메인까지 내려보내 `DomainError` 로 막으면
 * 화면에 "완료된 항목은…" 토스트가 뜨는데, 드롭을 거절한 것뿐이라 말할 것이 없다.
 */
export function dropTargetIndex(
  sequence: readonly DragSlot[],
  draggedId: string,
  overId: string,
  after: boolean,
): number | null {
  const from = sequence.find((slot) => slot.id === draggedId);
  const over = sequence.find((slot) => slot.id === overId);
  if (from === undefined || over === undefined || from.done || over.done) return null;
  return moveTargetIndex(
    sequence.map((slot) => slot.id),
    draggedId,
    overId,
    after,
  );
}

/** 순서 변경 뒤 낭독할 **미완료 블록 기준** 위치(1부터). 완료 항목은 세지 않는다 — 화면에 그 블록이 따로다. */
export function incompletePosition(sequence: readonly DragSlot[], id: string): number | null {
  const index = sequence.filter((slot) => !slot.done).findIndex((slot) => slot.id === id);
  return index === -1 ? null : index + 1;
}
