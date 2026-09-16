// 공개 API 배럴 — src/ 에서 index.ts 가 허용되는 유일한 위치(code-style.md §2).
// `THEME_INIT_SCRIPT` 는 app 레이어(layout.tsx)가 <head> 에 심는 첫 페인트 스크립트다(theme R6).
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
