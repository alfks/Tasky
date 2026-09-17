/**
 * 열려 있는 오버레이(대화상자·팝오버) 레이어 스택.
 *
 * 왜 필요한가: 각 오버레이는 `document` 캡처 단계에 자기 `keydown` 리스너를 따로 건다. 같은 노드에
 * 걸린 캡처 리스너는 **등록 순서대로 전부** 실행되고 `stopPropagation()` 은 형제 리스너를 막지
 * 못하므로(막으려면 `stopImmediatePropagation`), 먼저 마운트된 **바깥** 레이어가 Esc 를 먼저
 * 먹어 치운다. 실제로 대화상자 안의 팝오버에서 Esc 를 한 번 누르면 둘 다 닫혔다(리뷰 B-2).
 * 이벤트 순서로는 "누가 위인가"를 알 수 없으므로 그 사실을 이벤트 밖에서 들고 있는다.
 *
 * 한계: 두 레이어가 **같은 커밋에서 동시에** 열리면 React 가 자식 효과를 먼저 실행하므로 push
 * 순서가 화면상의 위아래와 뒤집힌다. 사용자가 클릭으로 하나씩 여는 일반 경로에서는 생기지 않는다.
 */
export type OverlayLayer = {
  /** 이 레이어가 그린 DOM 이 이 노드를 품고 있는지(포털된 패널 포함). */
  contains: (node: Node) => boolean;
  /**
   * 이 레이어가 **스스로 포커스를 가두는가**(모달 대화상자 true, 팝오버 false).
   * 아래 레이어는 이 값을 보고 "내가 물러나도 누군가 가두는가"를 판단한다 — 아무도 가두지 않는
   * 구간이 생기면 Tab 한 번에 포커스가 `body` 로 떨어진다(app-shell R14, 리뷰 F2).
   */
  traps?: boolean;
  /** 이 레이어가 그린 루트 요소. 아래 레이어가 순환 집합을 넓힐 때 쓴다. */
  element?: () => HTMLElement | null;
};

const stack: OverlayLayer[] = [];

/** 레이어를 맨 위에 올리고, 내리는 함수를 돌려준다. */
export function pushOverlayLayer(layer: OverlayLayer): () => void {
  stack.push(layer);
  return () => {
    const index = stack.indexOf(layer);
    if (index !== -1) stack.splice(index, 1);
  };
}

/** 맨 위 레이어인가 — Esc 는 이 레이어 하나만 소비한다. */
export function isTopOverlayLayer(layer: OverlayLayer): boolean {
  return stack.length > 0 && stack[stack.length - 1] === layer;
}

/** 이 레이어보다 **위**에 쌓인 레이어들(아래 → 위 순서). 스택에 없으면 빈 배열. */
export function overlayLayersAbove(layer: OverlayLayer): readonly OverlayLayer[] {
  const index = stack.indexOf(layer);
  if (index === -1) return [];
  return stack.slice(index + 1);
}

/**
 * 이 레이어보다 **위**에 있는 레이어가 그 노드를 품고 있는지.
 * 포털로 body 에 나간 팝오버 안을 클릭한 것을 대화상자가 "바깥 클릭"으로 오해하지 않게 한다.
 */
export function isInsideLayerAbove(layer: OverlayLayer, node: Node): boolean {
  return overlayLayersAbove(layer).some((above) => above.contains(node));
}

/**
 * 지금 **화면에 떠 있는** 오버레이의 수. `0` 이면 아무것도 열려 있지 않다.
 *
 * 테스트 보조가 아니라 제품 코드가 쓰는 신호다: 전역 단축키는 이것이 `0` 일 때만 돌고
 * (`useShortcutDispatch`), PWA 업데이트 토스트와 조용한 새로고침은 이것이 `0` 이 되기를
 * 기다린다(`useOverlayDeferral`·`usePwaLifecycle`, pwa.md R4).
 *
 * 그래서 **DOM 을 그리지 않는 것을 스택에 올리면 안 된다.** 감시·판정 목적으로 빈 레이어를 하나
 * 눌러 두면 이 값이 영원히 1 이상이 되어, 위 두 기능이 조용히 죽는다 — 실제로 그랬다(T-44).
 * "내가 맨 위인가" 가 필요하면 진짜 오버레이만 `pushOverlayLayer` 하고, "무엇이든 열려 있는가" 는
 * 여기서 읽는다.
 */
export function overlayLayerCount(): number {
  return stack.length;
}
