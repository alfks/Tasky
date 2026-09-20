// 행 삭제 뒤 포커스가 갈 곳 (app-shell.md R14) — D-day 삭제(calendar T-79 리뷰 라운드 1 Major-1) 전용 이식.
//
// **원본은 `@/features/shell/lib/focus-fallback.ts` 다.** 그 파일을 직접 import 하지 못하는 이유는
// 재사용성이 아니라 조립 방향이다: `AppShell`(shell) 이 `ShellInsights` 를 거쳐 `DdayPanelSection`
// (calendar) 을 그리므로 `shell → calendar` 의존이 이미 있고, 거꾸로 `calendar → shell`(어느 배럴
// export 든) 을 더하면 `import/no-cycle` 이 잡는 순환이 생긴다(실측: `@/features/shell` 배럴 경유로
// 바꿔 봤더니 `AppShell → ShellInsights → calendar → DdayPanelSection → shell` 순환 6건). 그래서
// R14 순서(다음 형제 → 이전 형제 → 목록 컨테이너)만 그대로 옮긴다 — 원본과 한 글자도 다르지 않다.
// `calendar/AGENTS.md` 의 관할 선언이 두 파일이 갈라지지 않게 표시해 둔다.
//
// D-day 행은 `<nav>` 안에 있지 않으므로 원본의 "목록마저 사라지면 그 영역의 첫 조작 지점" 단계
// (`region`)는 옮기지 않는다 — D-day 삭제는 항상 되돌리기 토스트가 뒤따르므로(`DdayPanelSection` 의
// 되돌리기 브리지, `useRemovalToastBridge`(`CategoryRemoveDialog.tsx`)와 같은 이유) 그 토스트 버튼이
// 실질적인 마지막 후보다.

/** 브라우저 기본 탭 순서와 같은 집합. `focus-fallback.ts` 의 것과 같다. */
const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** 삭제를 요청한 순간의 자리표. 대상이 사라진 **뒤에** 이 값으로 다음 자리를 찾는다. */
export type RowAnchor = { list: HTMLElement; index: number };

/** 지금 포커스가 놓인 행에서 자리표를 뜬다. 행 밖이면 `null`. */
export function rowAnchorOf(element: Element | null): RowAnchor | null {
  const row = element?.closest('li');
  const list = row?.parentElement;
  if (row === undefined || row === null || !(list instanceof HTMLElement)) return null;
  const rows = Array.from(list.children);
  return { list, index: rows.indexOf(row) };
}

function firstFocusableIn(root: Element | null): HTMLElement | null {
  return root?.querySelector<HTMLElement>(FOCUSABLE) ?? null;
}

/** 자리표가 가리키던 행이 사라진 뒤 포커스를 받을 요소 (R14 순서, `focus-fallback.ts` 와 동일). */
export function focusAfterRowRemoval(anchor: RowAnchor | null): HTMLElement | null {
  if (anchor === null || !anchor.list.isConnected) return null;
  const { list, index } = anchor;
  const rows = Array.from(list.children);
  const next = rows[index] ?? rows[index - 1] ?? null;
  const target = firstFocusableIn(next);
  if (target !== null) return target;
  if (rows.length > 0) {
    list.tabIndex = -1;
    return list;
  }
  return null;
}
