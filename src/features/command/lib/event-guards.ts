/**
 * 전역 단축키가 **발동하면 안 되는** 상황 판정(R1·R6). 디스패처가 부르는 유일한 관문이다.
 *
 * 네 가지를 한 함수에 모은 이유: 각 가드를 호출처마다 따로 쓰면 하나가 빠진 경로가 생기고, 그
 * 경로는 "한글로 제목을 치다가 ㅅ 을 눌렀더니 날짜가 바뀐다" 처럼 특정 사용자에게만 보인다.
 * 어디서 막혔는지 이유를 돌려주므로 테스트가 "막혔다" 가 아니라 "왜 막혔다" 를 단언할 수 있다.
 */
import { isImeKey } from '@/lib/ime';

/** 막힌 이유. `null` 이면 통과. */
export type ShortcutBlockReason = 'handled' | 'ime' | 'overlay' | 'editable';

/** 텍스트를 입력받는 요소에 포커스가 있는가. `select` 도 화살표가 값을 바꾸므로 포함한다. */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName;
  // 체크박스·라디오·range 도 Space·화살표를 스스로 쓴다 — input 은 종류를 가리지 않고 비켜 준다.
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return target.closest('[contenteditable]:not([contenteditable="false"])') !== null;
}

export type GuardContext = {
  /** 이 단축키 위에 열린 오버레이가 없는가(오버레이 스택의 맨 위인가). */
  isTopLayer: boolean;
  /** 입력 중에도 동작하는 단축키인가(`Mod+K` 팔레트 — R1). */
  allowInEditable: boolean;
};

/**
 * 막을 이유가 있으면 그 이유를, 없으면 `null`.
 *
 * 순서에 의미가 있다.
 * 1. `handled` — 누군가 이미 `preventDefault()` 했다. 날짜 스트립은 포커스가 그 안에 있을 때
 *    `←/→` 로 셀을 옮기며 기본 동작을 막는다. 여기서 비켜 주지 않으면 한 번의 `←` 가 날짜를
 *    **두 칸** 옮긴다(스트립이 한 칸 + 전역이 한 칸).
 * 2. `ime` — 조합 중(R6). `Mod+K` 처럼 입력 중에도 도는 단축키에도 적용된다: 조합 중에는
 *    `key` 가 `Process`/`Unidentified` 로 오는 조합기가 있어 매칭 자체를 신뢰할 수 없다.
 * 3. `overlay` — 대화상자·팝오버·메뉴가 떠 있다. 그 뒤에서 날짜가 바뀌면 닫았을 때 화면이 달라져 있다.
 * 4. `editable` — 입력 중(R1).
 */
export function shortcutBlockReason(
  e: KeyboardEvent,
  ctx: GuardContext,
): ShortcutBlockReason | null {
  if (e.defaultPrevented) return 'handled';
  if (isImeKey(e)) return 'ime';
  if (!ctx.isTopLayer) return 'overlay';
  if (!ctx.allowInEditable && isEditableTarget(e.target)) return 'editable';
  return null;
}
