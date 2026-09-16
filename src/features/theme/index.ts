// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2).
// `THEME_INIT_SCRIPT` 는 `index.html` 의 <head> 에 인라인으로 들어가는 첫 페인트 스크립트의 사본이다(theme R6).
// 앱 코드가 부르지는 않는다 — 테스트가 실행해 동작을 검증하고 index.html 과 대조한다(ADR-0013).
export { FONT_PRELOAD, THEME_INIT_SCRIPT } from '@/features/theme/store/theme-head';

export { createThemeStore, useThemeStore } from '@/features/theme/store/theme-store';
export type { ThemeActions, ThemeStore } from '@/features/theme/store/theme-store';
export {
  appliedTheme,
  resolveTheme,
  THEME_COLOR,
  THEME_MIRROR_KEY,
  toggledMode,
  toMirror,
} from '@/features/theme/store/theme-state';
export type {
  AppliedTheme,
  ResolvedTheme,
  ThemeLoadStatus,
  ThemeMirror,
  ThemeState,
} from '@/features/theme/store/theme-state';

export { useThemeSync } from '@/features/theme/hooks/useThemeSync';
export type { ThemeSyncState } from '@/features/theme/hooks/useThemeSync';

export { ThemeModeToggle } from '@/features/theme/components/ThemeModeToggle';
export { ThemeSettingsPopover } from '@/features/theme/components/ThemeSettingsPopover';
