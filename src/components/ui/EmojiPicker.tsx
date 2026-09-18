'use client';

import { useRef } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { cn } from '@/lib/cn';
import { isImeKey } from '@/lib/ime';

type EmojiOption = {
  /** 저장되는 값. 빈 문자열은 "이모지 없음". */
  emoji: string;
  /** 한국어 뜻 — 라디오의 접근 이름이 된다(그림은 `aria-hidden` 이라 낭독되지 않는다). */
  name: string;
};

type EmojiPickerProps = {
  /** 그룹의 접근 이름. 예: '이모지' */
  label: string;
  /** 제공 목록. 값의 단일 소스는 `@/domain/theme/emoji` 이고 호출자가 주입한다. */
  options: readonly EmojiOption[];
  /** 선택된 이모지. `''` 는 "없음". */
  value: string;
  /** 선택이 바뀌었을 때. `''` 이면 이모지를 쓰지 않는다는 뜻이다. */
  onChange: (emoji: string) => void;
  className?: string;
};

/** "없음" 칸. 이모지는 선택 필드(`Category.emoji?`)라 **고르지 않음도 하나의 선택지**다. */
const NONE_OPTION: EmojiOption = { emoji: '', name: '없음' };

/** "없음" 칸에 그리는 글리프. 빈 칸으로 두면 격자에 구멍이 뚫려 선택지로 보이지 않는다. */
const NONE_GLYPH = '—';

/** 격자의 열 수. 위·아래 방향키가 한 줄을 건너뛰려면 클래스(`grid-cols-6`)와 같은 값이어야 한다. */
const COLUMNS = 6;

/**
 * 목록 밖 값의 이름. 자유 입력 시절(T-70 이전)에 저장된 이모지가 여기로 온다 —
 * **지우지 않고 그대로 보여 준다.** 사용자 데이터이고, 마이그레이션으로 날릴 근거가 없다.
 */
function customOptionOf(value: string, options: readonly EmojiOption[]): EmojiOption | undefined {
  if (value === '' || options.some((option) => option.emoji === value)) return undefined;
  return { emoji: value, name: `직접 고른 이모지 ${value}` };
}

/**
 * 카테고리 이모지 선택 라디오 그룹 (category §2-B·R4). `ColorSwatchGroup` 과 **같은 구조**다 —
 * 같은 다이얼로그 안의 두 선택이 서로 다른 조작법을 갖지 않게 한다: 방향키·Home/End 로 옮기고,
 * 선택 표시는 앱 공통 잉크 링(`--color-selected-ring`·`--control-selected-ring`, theme R19)이며,
 * IME 조합 중 방향키는 무시한다(한글 이름 입력에서 넘어온 조합이 선택을 옮기지 않게).
 */
export function EmojiPicker({ label, options, value, onChange, className }: EmojiPickerProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const custom = customOptionOf(value, options);
  // "없음" → (있다면) 직접 고른 값 → 제공 목록. 저장된 값은 항상 격자 안에 자리가 있다.
  const cells: readonly EmojiOption[] = [
    NONE_OPTION,
    ...(custom === undefined ? [] : [custom]),
    ...options,
  ];
  const selectedIndex = cells.findIndex((cell) => cell.emoji === value);
  // 선택이 없을 수는 없지만(없음도 칸이다) 방어적으로 첫 칸을 탭 진입점으로 둔다.
  const tabbableIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const selectAt = (index: number) => {
    const next = (index + cells.length) % cells.length;
    buttonRefs.current[next]?.focus();
    onChange(cells[next].emoji);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (isImeKey(e.nativeEvent)) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      selectAt(index + 1);
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      selectAt(index - 1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      selectAt(index + COLUMNS);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      selectAt(index - COLUMNS);
    } else if (e.key === 'Home') {
      e.preventDefault();
      selectAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      selectAt(cells.length - 1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'grid grid-cols-6 gap-[var(--space-2)]',
        // 30칸이면 5줄이라 다이얼로그가 세로로 길어진다. 네 줄 남짓에서 자르고 스크롤한다 —
        // 잘린 다섯째 줄이 "더 있다" 는 신호가 된다. 안쪽 여백은 포커스 윤곽선(offset 2px)이
        // 스크롤 상자 경계에서 잘리지 않게 두는 것이다.
        'max-h-[172px] overflow-y-auto p-[var(--space-1)]',
        className,
      )}
    >
      {cells.map((cell, index) => {
        const isSelected = cell.emoji === value;
        return (
          <button
            key={cell.emoji === '' ? '__none__' : cell.emoji}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={cell.name}
            title={cell.name}
            tabIndex={index === tabbableIndex ? 0 : -1}
            onClick={() => onChange(cell.emoji)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={cn(
              'flex size-[var(--control-hit-min)] items-center justify-center rounded-full',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-[var(--control-hit-min)] items-center justify-center rounded-full',
                'text-base leading-none',
                // 선택 표시는 `ColorSwatchGroup` 과 **같은 토큰·같은 픽셀**이다(theme R19).
                // 여기서는 체크 문자를 겹칠 자리가 없다(칸이 이미 그림이다) — 대신 테두리 굵기가
                // 1px → 2px 로 바뀌는 형태 변화가 색과 무관한 단서다. `border-style` 을 함께 적는
                // 것은 Tailwind 프리플라이트(`border: 0 solid`)에 기대지 않기 위해서다.
                isSelected
                  ? '[border-width:var(--control-selected-ring)] [border-style:solid] border-selected-ring bg-surface-2'
                  : 'border border-transparent',
                cell.emoji === '' ? 'text-sm text-muted' : '',
              )}
            >
              {cell.emoji === '' ? NONE_GLYPH : cell.emoji}
            </span>
          </button>
        );
      })}
    </div>
  );
}
