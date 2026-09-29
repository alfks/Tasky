// 붕괴 순서의 단일 소스 (app-shell.md §2-B · R4). 폭 하나를 받아 이름 하나를 돌려주는 순수 함수라
// 컴포넌트 밖에서 단위 테스트할 수 있고, 컴포넌트는 이름만 보고 무엇을 그릴지 정한다.

/**
 * 스펙 R4 의 두 경계. 여기 말고 어디에도 숫자를 적지 않는다.
 *
 * 전에는 셋(1280/1024/768)이었다 — `narrow`(768~1023) 갈래는 사용자 피드백("창을 50% 로 줄여도
 * 달력·할 일의 자리가 바뀌지 않게")으로 없앴다. 2영역(달력 컬럼 + 선택 날짜 패널)의 하한이 1024 였던
 * 진짜 이유는 폭이 아니라 컬럼 치수(달력 440 + 패널 400 + 간격·거터)였고, 치수를 줄이자 `mid` 와
 * `narrow` 가 JS 쪽에서 구별할 것이 하나도 없어졌다(calendar-layout.md R2·R8·R10). 680 은 흔한
 * 모니터의 반쪽(1366→683 · 1440→720 · 1536→768 · 1920→960)을 전부 덮는 값이다. **768 은 이제
 * CSS 밀도 경계로만 남는다**(`tokens.css` 의 `max-width: 767.98px` — 달력 밀도·할 일 행 밀도·
 * 모바일 `--text-*` 토큰) — 그래서 680~767 의 반쪽 창은 "2영역 + 모바일 밀도" 가 된다.
 */
export const SHELL_BREAKPOINTS = { wide: 1280, mid: 680 } as const;

/**
 * - `wide`    ≥1280 — 2영역 + 사이드바 `[고정]` 허용.
 * - `mid`     680~1279 — 2영역 그대로, 사이드바는 드로어만(고정 불가).
 * - `compact` <680 — 한 컬럼(`ShellMain`) + 하단 고정 [+ 할 일].
 */
export type ShellLayout = 'wide' | 'mid' | 'compact';

export function layoutFor(width: number): ShellLayout {
  if (width >= SHELL_BREAKPOINTS.wide) return 'wide';
  if (width >= SHELL_BREAKPOINTS.mid) return 'mid';
  return 'compact';
}

/**
 * 사이드바를 **컬럼으로 고정할 수 있는** 폭인가 — `wide` 뿐이다(calendar-layout.md §1-A·R23~R24).
 * `hasSidebarColumn`·`ShellOverlays`(드로어 제목줄에 `[고정]` 을 낼지)가 **같은 판정**을 써야 한다 —
 * 전에는 `ShellOverlays` 가 `layout === 'wide'` 를 문자열로 다시 적어 사본이 넷째로 늘어나 있었다
 * (리뷰 Major 4).
 */
export function canPinSidebar(layout: ShellLayout): boolean {
  return layout === 'wide';
}

/**
 * 사이드바가 **컬럼으로** 서 있는가 — `wide` + `sidebarPinned` 일 때만
 * (calendar-layout.md §1-A·R23~R24: 드로어가 모든 폭의 기본이고, 고정은 `wide` 에서만 켤 수 있다).
 * 아니면 ☰ 드로어다(§2-B). `mid` 에서 `sidebarPinned` 를 넘겨도 거짓이다 — `mid` 는 고정 자체가
 * 불가능하다는 사실이 이 한 줄의 판정식에서 그대로 따라 나온다(R10, 별도 분기 없음).
 */
export function hasSidebarColumn(layout: ShellLayout, sidebarPinned: boolean): boolean {
  return canPinSidebar(layout) && sidebarPinned;
}

/**
 * 인사이트가 **컬럼으로** 서 있는 폭인가 — `wide`·`mid` 양쪽(calendar-layout.md R4·R24: 2영역이면
 * 인사이트는 항상 달력 아래 컬럼이다, 사이드바만 드로어로 내려간다). 아니면 `◯ 60%` 버튼 +
 * 오버레이다(§2-B). 접힘(`insightCollapsed`)은 이 함수 밖에서 따로 본다 — 폭 하나로 정해지는 것은
 * "이 폭이 컬럼을 낼 수 있는가" 뿐이고, 사용자가 접었는지는 `useShellPanels` 가 얹는다.
 */
export function hasInsightColumn(layout: ShellLayout): boolean {
  return layout === 'wide' || layout === 'mid';
}

/**
 * 2영역(달력 컬럼 + 선택 날짜 패널)이 서는 폭인가 — 지금은 `hasInsightColumn` 과 값이 같지만
 * **뜻이 다르다**: 이것은 "레이아웃 자체가 둘로 나뉘는가"이고 `hasInsightColumn` 은 "인사이트가
 * 그중 컬럼을 얻는가"다. `AppShell` 이 예전에 `hasInsightColumn` 하나를 두 질문에 함께 썼는데,
 * 인사이트 정책만 바뀌어도(예: 인사이트를 `wide` 전용으로 좁히면) 2영역 레이아웃이 `mid` 에서
 * 조용히 1열로 무너진다(리뷰 Minor) — 그래서 판정을 분리해 둔다. `layout.test.ts` 가 두 함수를
 * **함께** 고정해 갈라지면 바로 드러나게 한다.
 */
export function hasDayPanelColumn(layout: ShellLayout): boolean {
  return layout === 'wide' || layout === 'mid';
}

/** 하단 고정 [+ 할 일] 버튼이 붙는 폭 (§2-B `<680px`). */
export function hasBottomAddButton(layout: ShellLayout): boolean {
  return layout === 'compact';
}
