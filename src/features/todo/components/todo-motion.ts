// R8 이동 모션의 **순수 부분**. DOM·React·타이머를 모르는 계산만 둔다 — 여기 규칙이 깨졌는지는
// jsdom 없이도 확인할 수 있어야 하고, 실제 브라우저에서만 보이는 것은 FLIP 의 시각 효과뿐이다.
//
// 모션의 형태(todo.md R8):
//   체크 → 체크 애니메이션(--motion-fast) → 400ms 대기 → 완료 블록으로 이동(FLIP, --motion-base)
// 대기 중에는 항목이 **제자리에서** 취소선 상태로 보이고, 같은 그룹에서 추가 토글이 일어나면
// 타이머를 다시 시작하지 않고 **같은 배치에 합류**해 함께 내려간다.

/** 체크 애니메이션이 끝나고 자리를 옮기기까지의 대기(ms). theme.md 의 모션 토큰과는 다른 축이다 —
 *  토큰은 "얼마 동안 움직이는가", 이 값은 "언제 움직이기 시작하는가" 라서 값의 출처가 todo.md R8 이다. */
export const COMPLETION_WAIT_MS = 400;

/** 한 그룹의 화면 배치를 id 로만 나타낸 것. 미완료 블록 → (입력 행) → 구분선 → 완료 블록 (R7). */
export type BlockOrder = {
  readonly incomplete: readonly string[];
  readonly completed: readonly string[];
};

/**
 * 대기 중 화면에 유지할 배치 (R8).
 *
 * `frozen` 은 **첫 토글 직전의** 배치이고 `current` 는 스토어가 이미 반영한 지금의 배치다.
 * 규칙 셋:
 *   1. 얼려 둔 항목은 `frozen` 이 정한 블록·순서 그대로 남는다 — 방금 체크한 항목이 미완료 블록
 *      제자리에서 취소선으로 보이는 것이 이 줄이다.
 *   2. 그 사이 사라진 항목(삭제·날짜 이동)은 내린다 — 대기 때문에 없는 행이 남아 있으면 안 된다.
 *   3. 대기 중 새로 생긴 항목은 `current` 가 정한 블록 끝에 붙인다 — 입력 행에서 연속으로 넣은
 *      할 일이 400ms 동안 보이지 않으면 입력이 먹힌 것처럼 느껴진다(R3 연속 입력).
 */
export function applyFrozenOrder(frozen: BlockOrder, current: BlockOrder): BlockOrder {
  const live = new Set([...current.incomplete, ...current.completed]);
  const frozenIds = new Set([...frozen.incomplete, ...frozen.completed]);
  const kept = (ids: readonly string[]): string[] => ids.filter((id) => live.has(id));
  const added = (ids: readonly string[]): string[] => ids.filter((id) => !frozenIds.has(id));
  return {
    incomplete: [...kept(frozen.incomplete), ...added(current.incomplete)],
    completed: [...kept(frozen.completed), ...added(current.completed)],
  };
}

/** 두 배치가 같은 항목을 같은 순서로 담고 있는지. 같으면 얼려 둘 이유가 없다(대기 종료 판정). */
export function sameBlockOrder(a: BlockOrder, b: BlockOrder): boolean {
  const same = (x: readonly string[], y: readonly string[]): boolean =>
    x.length === y.length && x.every((id, i) => id === y[i]);
  return same(a.incomplete, b.incomplete) && same(a.completed, b.completed);
}

/** FLIP 한 항목분. `dy` 는 **이전 자리 − 지금 자리** 라 바로 `translateY` 로 쓴다. */
export type FlipMove = { id: string; dy: number };

/**
 * 재배치 전후의 세로 위치에서 움직일 항목을 뽑는다(FLIP 의 Invert 단계).
 *
 * 양쪽에 다 있는 항목만 움직인다 — 새로 들어온 행은 "이전 자리" 가 없어 어디서 날아와야 할지
 * 정의되지 않고, 사라진 행은 이미 DOM 에 없다. 0px 이동은 버려서 쓸데없는 transition 을 만들지 않는다
 * (그 한 줄이 없으면 그룹 전체가 매 커밋마다 transition 을 달아 이동 중 다른 애니메이션을 끊는다).
 */
export function planFlip(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): FlipMove[] {
  const moves: FlipMove[] = [];
  for (const [id, top] of after) {
    const previous = before.get(id);
    if (previous !== undefined && previous !== top) {
      moves.push({ id, dy: previous - top });
    }
  }
  return moves;
}

/**
 * 두 배치 사이에 **블록을 건너뛴 항목**이 있는가 — 즉 완료 토글이 일어났는가 (R8).
 *
 * 대기를 시작하는 조건을 "배치가 달라졌는가" 가 아니라 이것으로 두는 이유: 할 일을 추가하거나
 * 순서를 바꾼 것만으로 400ms 를 기다리면 방금 넣은 행이 뒤늦게 나타나고 드래그가 멈칫한다.
 * 기다려야 하는 것은 체크뿐이다.
 */
export function hasCrossedBlocks(before: BlockOrder, after: BlockOrder): boolean {
  const wasDone = new Set(before.completed);
  const wasOpen = new Set(before.incomplete);
  return (
    after.completed.some((id) => wasOpen.has(id)) || after.incomplete.some((id) => wasDone.has(id))
  );
}
