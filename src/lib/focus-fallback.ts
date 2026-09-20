// 포커스를 담고 있던 요소가 **사라질 때** 갈 곳을 정한다 (app-shell.md R14 · §5).
//
// `Dialog` 는 열었던 요소가 살아 있으면 그리로 돌려보내고, 사라졌을 때만 호출자에게 대체 대상을
// 묻는다(`returnFocus`). 묻는데 아무도 답하지 않으면 포커스는 `<body>` 로 떨어지고 다음 Tab 이
// 문서 맨 위로 튄다 — 접근성 리뷰가 세 경로에서 실측한 자리다. 이 모듈이 그 답을 만든다.
//
// 규칙(R14): **다음 형제 → 이전 형제 → 목록 컨테이너**. 목록마저 사라졌으면 그 목록을 담고 있던
// 영역의 첫 조작 지점으로 간다(카테고리를 전부 지우면 `[첫 카테고리 만들기]` 가 그 자리다).
//
// **`src/lib/` 에 있다 — shell 전용이 아니다.** shell(카테고리 삭제)·calendar(D-day 삭제) 가 함께
// 쓴다. 배럴(`@/features/shell`)을 거치면 `AppShell → ShellInsights → calendar → shell` 순환이
// 생겨 calendar 는 이 파일을 배럴로도 직접 경로로도 가져올 수 없었다(`import/no-cycle` 실측 6건,
// `src/features/AGENTS.md` 규칙 5) — 그래서 두 feature 가 공유하는 순수 유틸의 자리인 여기로
// 올렸다. `src/lib/AGENTS.md` "무엇이 여기 올라오는가" 참고.

/** 브라우저 기본 탭 순서와 같은 집합. `Dialog` 의 것과 같은 목록이다. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** 삭제를 요청한 순간의 자리표. 대상이 사라진 **뒤에** 이 값으로 다음 자리를 찾는다. */
export type RowAnchor = {
  /** 행이 들어 있던 목록. 행이 지워져도 이 참조는 살아 있다. */
  list: HTMLElement;
  /** 그 목록에서 몇 번째 행이었나. */
  index: number;
  /** 목록마저 사라졌을 때 돌아갈 영역(사이드바 등). */
  region: HTMLElement | null;
};

/** 지금 포커스가 놓인 행에서 자리표를 뜬다. 행 밖이면 `null`. */
export function rowAnchorOf(element: Element | null): RowAnchor | null {
  const row = element?.closest('li');
  const list = row?.parentElement;
  if (row === undefined || row === null || !(list instanceof HTMLElement)) return null;
  const rows = Array.from(list.children);
  return { list, index: rows.indexOf(row), region: row.closest('nav') };
}

function firstFocusableIn(root: Element | null): HTMLElement | null {
  return root?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
}

/**
 * 자리표가 가리키던 행이 사라진 뒤 포커스를 받을 요소 (R14 의 순서 그대로).
 *
 * 목록 컨테이너로 떨어질 때는 `tabindex=-1` 을 달아 준다 — 달지 않으면 `focus()` 가 무위로 끝나고
 * 결국 `<body>` 다.
 */
export function focusAfterRowRemoval(anchor: RowAnchor | null): HTMLElement | null {
  if (anchor === null) return null;
  const { list, index, region } = anchor;
  if (list.isConnected) {
    const rows = Array.from(list.children);
    const next = rows[index] ?? rows[index - 1] ?? null;
    const target = firstFocusableIn(next);
    if (target !== null) return target;
    if (rows.length > 0) {
      list.tabIndex = -1;
      return list;
    }
  }
  return firstFocusableIn(region);
}

/**
 * 지금 떠 있는 토스트의 액션 버튼(`[되돌리기]`).
 *
 * 토스트 뷰포트는 `document.body` 의 **맨 끝**에 붙는 포털이라 Tab 순서에서도 맨 끝이다. 접근성
 * 리뷰 실측: 카테고리 삭제 직후 `[되돌리기]` 까지 Tab 29회, 토스트는 6,934ms 뒤 사라진다 —
 * 키보드만 쓰는 사용자에게는 없는 기능이다(R8 위반).
 *
 * 그래서 **파괴 확인의 결과로 포커스가 갈 곳을 잃었을 때에 한해** 그 버튼을 첫 후보로 삼는다.
 * 방금 사용자가 실행한 동작을 되돌리는 컨트롤이고, `Toast` 는 포커스가 들어오면 자동 닫힘 타이머를
 * 멈추므로(R8) 6초 제한도 함께 풀린다. 되돌릴 것이 없으면(액션 없는 토스트) `null` 이다.
 *
 * 셀렉터는 `'[data-overlay-always-live]'` **리터럴**이다 — `lib` 는 `@/components/ui/overlay-rules`
 * 의 `OVERLAY_ALWAYS_LIVE_ATTR` 를 import 할 수 없다(lib 밖을 import 하지 않는다는 경계 규칙,
 * `src/lib/AGENTS.md`). 두 선언이 갈라지면 이 함수는 조용히 아무것도 못 찾는다 — `focus-fallback.test.ts`
 * 의 `toastActionButton` 테스트가 그 상수를 import 해 속성을 달기 때문에, 갈라지는 순간 그 테스트가
 * 빨간불이 된다(어떤 도구도 이 둘을 정적으로 묶지 않는다 — 테스트가 유일한 안전망).
 */
export function toastActionButton(doc: Document): HTMLElement | null {
  const viewports = Array.from(
    doc.body.querySelectorAll<HTMLElement>('[data-overlay-always-live]'),
  );
  for (const viewport of viewports.reverse()) {
    const button = viewport.querySelector<HTMLButtonElement>('button');
    if (button !== null) return button;
  }
  return null;
}

/**
 * 접힘 토글처럼 **자기가 들어 있던 영역을 없애는** 컨트롤이 눌렸을 때, 그 자리를 잇는 컨트롤.
 * 영역 안에 포커스가 없었으면 아무것도 하지 않는다 — 다른 곳을 보고 있는 사용자의 포커스를 뺏지 않는다.
 */
export function handoffFocus(container: HTMLElement | null, successorSelector: string): boolean {
  const active = document.activeElement;
  if (container === null || !(active instanceof Node) || !container.contains(active)) return false;
  const move = (): void => {
    document.querySelector<HTMLElement>(successorSelector)?.focus();
  };
  // 후임 컨트롤은 **이 토글의 결과로** 그려진다 — 다음 프레임에야 DOM 에 있다.
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(move);
  else move();
  return true;
}

/**
 * **"삭제 뒤 포커스를 다음 렌더로 미룰 때"의 표준 답(리뷰 #104 Minor).** 위 `handoffFocus` 가
 * `requestAnimationFrame` 을 쓰는 것을 보고 같은 문제(스토어 쓰기 완료 ≠ React 렌더 커밋)에
 * `requestAnimationFrame`/`queueMicrotask` 를 복제하고 싶어질 수 있다 — **그러지 마라.** 둘 다
 * "이만큼 기다리면 되겠지" 라는 **타이밍 추측**이다. React 는 "쓰기 후 한 프레임/한 틱 안에
 * 커밋한다" 를 계약으로 보장하지 않는다(형제 PR #105 가 `queueMicrotask` 로 고쳤을 때 실측으로는
 * 옳았지만, 그건 그 경로가 `useSyncExternalStore` 동기 플러시라는 **우연** 때문이었다).
 *
 * 옳은 모양은 **effect 의존성**이다 — 지우려는 목록의 길이(또는 지운 항목이 `byId` 에서 빠졌는지)
 * 를 의존성으로 하는 `useEffect` 에서, "그 목록이 실제로 줄어들었을 때만" 포커스를 옮긴다:
 *
 * ```ts
 * const pending = useRef(false);
 * const prevLength = useRef(items.length);
 * useEffect(() => {
 *   if (pending.current && items.length < prevLength.current) {
 *     pending.current = false;
 *     fallback()?.focus();
 *   }
 *   prevLength.current = items.length;
 * }, [items.length, fallback]);
 * // 삭제 핸들러는 쓰기가 끝나면 pending.current = true 만 세운다(직접 focus() 하지 않는다).
 * ```
 *
 * React 가 그 사이에 몇 번을 더 렌더하든, 실제로 **줄어든 렌더 다음 커밋**에서만 반응한다 —
 * 몇 프레임 뒤인지 추측하지 않는다(`RoutineManager.tsx` 의 실제 구현 참고).
 */

/**
 * 요소를 보이게 한 뒤 포커스를 준다. `scrollIntoView` 는 jsdom 에 없고 구형 런타임에서도 빠질 수
 * 있어 있는지 확인하고 부른다(`DateStrip` 의 같은 규약). 모션 축소를 선호하면 즉시 이동한다(R13).
 */
export function revealAndFocus(element: HTMLElement | null): void {
  if (element === null) return;
  if (typeof element.scrollIntoView === 'function') {
    const reduced =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    element.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' });
  }
  element.focus();
}
