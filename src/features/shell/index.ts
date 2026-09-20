// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2). 명시 export 만 둔다.
//
// `src/app/page.tsx` 가 꺼내는 것은 `AppShell` **하나**다. 셸의 내부 조각(사이드바·헤더·패널)은
// 밖에서 쓸 일이 없다 — 화면이 하나뿐이고(ADR-0001) 그 화면이 곧 이 컴포넌트다.
export { AppShell } from '@/features/shell/components/AppShell';

// 토스트 허브: feature 가 자기 뷰포트를 띄우는 대신 여기에 밀어 넣는다(app-shell R8).
export { useShellToastStore, MAX_VISIBLE_TOASTS } from '@/features/shell/store/shell-toast-store';
export type { ShellToastState } from '@/features/shell/store/shell-toast-store';

// **`useRemovalReturnFocus` 는 여기서 열지 않는다.** `shell` 이 `AppShell` 을 통해 `calendar` 를
// 조립하므로, 이 배럴에서 무엇을 내보내든 `calendar` 가 이 배럴을 import 하면 `shell → … → calendar
// → shell` 순환이 생긴다(`import/no-cycle` 실측, calendar T-79 리뷰 라운드 1 Major-1). D-day 삭제는
// 그 훅의 R14 규칙만 `src/features/calendar/lib/removal-focus.ts` 에 이식해 쓴다 — 배럴을 열지 않은
// 이유를 여기 적어 둔다(다음에 또 시도하지 않게).
