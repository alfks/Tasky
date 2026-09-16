'use client';

import { useRef } from 'react';
import type { CSSProperties, KeyboardEvent as ReactKeyboardEvent } from 'react';

import { cn } from '@/lib/cn';
import { isImeKey } from '@/lib/ime';

type ColorSwatchOption = {
  /** 저장되는 값. 팔레트 프리셋 id(theme.md §3-C). */
  id: string;
  /** 한국어 색 이름 — 라디오의 접근 이름이 된다. */
  name: string;
  /** 실제 색 HEX. --cat-color 로 전달된다. */
  color: string;
};

type ColorSwatchGroupProps = {
  /** 그룹의 접근 이름. 예: '카테고리 색' */
  label: string;
  /** 선택지. 기본은 theme.md §3-C 의 12색이며 값은 호출자가 주입한다. */
  options: readonly ColorSwatchOption[];
  /** 선택된 옵션 id. */
  value: string;
  /** 선택이 바뀌었을 때. */
  onChange: (id: string) => void;
  className?: string;
};

/**
 * 색 선택 라디오 그룹(theme.md §5). 선택 상태는 색이 아니라 체크 표시와 테두리로도 드러나고,
 * 방향키·Home/End 로 옮길 수 있다.
 */
export function ColorSwatchGroup({
  label,
  options,
  value,
  onChange,
  className,
}: ColorSwatchGroupProps) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const selectedIndex = options.findIndex((option) => option.id === value);
  // 선택이 없으면(저장값이 프리셋 밖) 첫 칸이 탭 진입점이 된다 — 그룹 전체가 탭에서 빠지지 않게.
  const tabbableIndex = selectedIndex === -1 ? 0 : selectedIndex;

  const selectAt = (index: number) => {
    const next = (index + options.length) % options.length;
    buttonRefs.current[next]?.focus();
    onChange(options[next].id);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (isImeKey(e.nativeEvent)) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
      e.preventDefault();
      selectAt(index + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
      e.preventDefault();
      selectAt(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      selectAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      selectAt(options.length - 1);
    }
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn('grid grid-cols-6 gap-[var(--space-2)]', className)}
    >
      {options.map((option, index) => {
        const isSelected = option.id === value;
        return (
          <button
            key={option.id}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={isSelected}
            aria-label={option.name}
            title={option.name}
            tabIndex={index === tabbableIndex ? 0 : -1}
            onClick={() => onChange(option.id)}
            onKeyDown={(e) => handleKeyDown(e, index)}
            style={{ '--cat-color': option.color } as CSSProperties}
            className={cn(
              'flex size-[var(--control-hit-min)] items-center justify-center rounded-full',
              'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'flex size-[calc(var(--control-hit-min)-var(--space-1))] items-center justify-center rounded-full',
                'bg-[var(--cat-color)] text-sm font-bold text-on-accent',
                // 선택 표시는 색이 아니라 형태로도 드러나야 한다: 체크 문자 + 굵은 테두리.
                isSelected ? 'border-2 border-text' : 'border border-border',
              )}
            >
              {isSelected ? '✓' : ''}
            </span>
          </button>
        );
      })}
    </div>
  );
}
