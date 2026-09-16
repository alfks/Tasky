'use client';

import { useRef, useState } from 'react';

import { findPaletteColor, PALETTE, resolvePaletteColor } from '@/domain/theme/palette';
import type { ThemeMode } from '@/domain/theme/settings';

import { resolveTheme } from '@/features/theme/store/theme-state';
import { useThemeStore } from '@/features/theme/store/theme-store';

import { ColorSwatchGroup } from '@/components/ui/ColorSwatchGroup';
import { IconButton } from '@/components/ui/IconButton';
import { Popover } from '@/components/ui/Popover';

/** 팝오버의 모드 선택지 (theme §2 의 표기 순서). */
const MODE_OPTIONS: readonly { value: ThemeMode; label: string }[] = [
  { value: 'system', label: '시스템' },
  { value: 'light', label: '라이트' },
  { value: 'dark', label: '다크' },
];

type ThemeSettingsPopoverProps = {
  className?: string;
};

/**
 * 설정(⚙) 버튼과 그 팝오버 — 3모드 라디오 + 강조색 12색 (theme §2·§5).
 *
 * 스와치에 보이는 색은 **지금 모드에서 실제로 쓰이는 값**이다(다크 모드면 프리셋의 다크 HEX).
 * 저장되는 값은 언제나 라이트 HEX 하나다(R3).
 */
export function ThemeSettingsPopover({ className }: ThemeSettingsPopoverProps) {
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const mode = useThemeStore((state) => state.mode);
  const systemDark = useThemeStore((state) => state.systemDark);
  const accentColor = useThemeStore((state) => state.accentColor);
  const setMode = useThemeStore((state) => state.setMode);
  const setAccentColor = useThemeStore((state) => state.setAccentColor);

  const resolved = resolveTheme(mode, systemDark);
  const options = PALETTE.map((color) => ({
    id: color.id,
    name: color.name,
    color: resolvePaletteColor(color.light, resolved),
  }));
  // 저장값이 프리셋 밖이면(가져오기 — R4) 선택된 칸이 없다. 그래도 그룹은 탭으로 들어갈 수 있다.
  const selectedId = findPaletteColor(accentColor)?.id ?? '';

  return (
    <>
      <IconButton
        ref={anchorRef}
        label="테마 설정"
        className={className}
        onClick={() => setOpen(true)}
      >
        ⚙
      </IconButton>
      <Popover
        open={open}
        onClose={() => setOpen(false)}
        anchorRef={anchorRef}
        label="테마 설정"
        placement="top-start"
        className="w-[240px]"
      >
        <div
          role="radiogroup"
          aria-label="테마"
          className="flex flex-col gap-[var(--space-1)] p-[var(--space-1)]"
        >
          {MODE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="flex items-center gap-[var(--space-2)] rounded-[var(--radius-md)] px-[var(--space-2)] py-[var(--space-1)] text-[length:var(--text-base)] text-text hover:bg-surface-2"
            >
              <input
                type="radio"
                name="theme-mode"
                value={option.value}
                checked={mode === option.value}
                onChange={() => {
                  void setMode(option.value);
                }}
                className="accent-[var(--color-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="px-[var(--space-2)] pt-[var(--space-3)] pb-[var(--space-2)] text-[length:var(--text-sm)] font-[var(--font-weight-semibold)] text-muted">
          강조색
        </p>
        <ColorSwatchGroup
          label="강조색"
          options={options}
          value={selectedId}
          onChange={(id) => {
            const preset = PALETTE.find((color) => color.id === id);
            if (preset === undefined) return;
            void setAccentColor(preset.light);
          }}
        />
      </Popover>
    </>
  );
}
