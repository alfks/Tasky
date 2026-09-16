// 붕괴 순서의 단일 소스 (app-shell.md §2-B · R4). 폭 하나를 받아 이름 하나를 돌려주는 순수 함수라
// 컴포넌트 밖에서 단위 테스트할 수 있고, 컴포넌트는 이름만 보고 무엇을 그릴지 정한다.

/** 스펙 R4 의 세 경계. 여기 말고 어디에도 숫자를 적지 않는다. */
export const SHELL_BREAKPOINTS = { wide: 1280, mid: 1024, narrow: 768 } as const;

/**
 * - `wide`    ≥1280 — 3컬럼.
 * - `mid`     1024~1279 — 인사이트가 헤더 버튼 + 오버레이로.
 * - `narrow`  768~1023 — 사이드바가 ☰ 드로어로. 메인 100%.
 * - `compact` <768 — 한 컬럼 + 하단 고정 [+ 할 일].
 */
export type ShellLayout = 'wide' | 'mid' | 'narrow' | 'compact';

export function layoutFor(width: number): ShellLayout {
  if (width >= SHELL_BREAKPOINTS.wide) return 'wide';
  if (width >= SHELL_BREAKPOINTS.mid) return 'mid';
  if (width >= SHELL_BREAKPOINTS.narrow) return 'narrow';
  return 'compact';
}

/** 사이드바가 **컬럼으로** 서 있는 폭인가. 아니면 ☰ 드로어다(§2-B). */
export function hasSidebarColumn(layout: ShellLayout): boolean {
  return layout === 'wide' || layout === 'mid';
}

/** 인사이트가 **컬럼으로** 서 있는 폭인가. 아니면 `◯ 60%` 버튼 + 오버레이다(§2-B). */
export function hasInsightColumn(layout: ShellLayout): boolean {
  return layout === 'wide';
}

/** 하단 고정 [+ 할 일] 버튼이 붙는 폭 (§2-B `<768px`). */
export function hasBottomAddButton(layout: ShellLayout): boolean {
  return layout === 'compact';
}
