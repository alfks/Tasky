'use client';

import { resolveTheme, toggledMode } from '@/features/theme/store/theme-state';
import { useThemeStore } from '@/features/theme/store/theme-store';

import { IconButton } from '@/components/ui/IconButton';

type ThemeModeToggleProps = {
  className?: string;
};

/**
 * 라이트 ↔ 다크 즉시 토글 (theme §2). `system` 모드였다면 **지금 보이는 것의 반대**를 명시 모드로
 * 고정한다 — 사용자가 누른 것은 "모드 순환" 이 아니라 "지금 화면을 바꿔라" 이기 때문이다.
 * 다시 OS 를 따르게 하려면 설정 팝오버에서 `시스템` 을 고른다(양방향 — R6·R7).
 */
export function ThemeModeToggle({ className }: ThemeModeToggleProps) {
  const mode = useThemeStore((state) => state.mode);
  const systemDark = useThemeStore((state) => state.systemDark);
  const setMode = useThemeStore((state) => state.setMode);
  const isDark = resolveTheme(mode, systemDark) === 'dark';

  return (
    <IconButton
      label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      aria-pressed={isDark}
      className={className}
      onClick={() => {
        void setMode(toggledMode({ mode, systemDark }));
      }}
    >
      {isDark ? '☀' : '☾'}
    </IconButton>
  );
}
