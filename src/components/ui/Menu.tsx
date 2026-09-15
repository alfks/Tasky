'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { cn } from '@/lib/cn';

/** 타이핑 이동 버퍼가 살아 있는 시간(ms). 이 시간이 지나면 다음 글자는 새 검색으로 친다. */
const TYPEAHEAD_RESET_MS = 500;

/**
 * IME 조합 중에 생긴 키 이벤트인지. 조합 중의 방향키·글자는 후보 목록을 고르는 입력이라
 * 메뉴 항목을 옮겨서는 안 된다(app-shell R14). 브라우저에 따라 isComposing 또는 keyCode 229
 * 중 하나로만 알려 주므로 둘 다 본다.
 */
function isImeKey(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}

type MenuItem = {
  /** 항목 식별자(key). */
  id: string;
  /** 표시 문구. 타이핑 이동도 이 문구로 찾는다. */
  label: string;
  /** 선택했을 때. */
  onSelect: () => void;
  /** 비활성 항목은 포커스는 받되 실행되지 않는다. */
  disabled?: boolean;
  /** 삭제처럼 파괴적인 항목은 위험 색으로 표시한다. */
  destructive?: boolean;
};

type MenuProps = {
  /** 메뉴의 접근 이름. 예: "카테고리 메뉴" */
  label: string;
  items: MenuItem[];
  /** 항목 선택·Esc 로 메뉴를 닫아야 할 때. */
  onClose?: () => void;
  /** 렌더되자마자 첫 항목에 포커스할지. 기본 true. */
  autoFocus?: boolean;
  className?: string;
};

/**
 * 키보드로 다룰 수 있는 메뉴 목록(role="menu"). 위치·바깥 클릭은 Popover 가 맡고,
 * 여기서는 항목 사이 이동(↑↓·Home/End·타이핑)과 실행만 책임진다.
 */
export function Menu({ label, items, onClose, autoFocus = true, className }: MenuProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typeaheadRef = useRef({ buffer: '', at: 0 });
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (autoFocus) itemRefs.current[0]?.focus();
  }, [autoFocus]);

  const focusAt = (index: number) => {
    const next = (index + items.length) % items.length;
    setActiveIndex(next);
    itemRefs.current[next]?.focus();
  };

  const moveByTypeahead = (char: string) => {
    const now = Date.now();
    const state = typeaheadRef.current;
    state.buffer = now - state.at > TYPEAHEAD_RESET_MS ? char : state.buffer + char;
    state.at = now;
    const query = state.buffer.toLowerCase();
    const order = items.map((_, i) => (activeIndex + 1 + i) % items.length);
    const found = order.find((i) => items[i].label.toLowerCase().startsWith(query));
    if (found !== undefined) focusAt(found);
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>, index: number) => {
    if (isImeKey(e.nativeEvent)) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusAt(index + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusAt(index - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusAt(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      focusAt(items.length - 1);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onClose?.();
    } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey && e.key !== ' ') {
      e.preventDefault();
      moveByTypeahead(e.key);
    }
  };

  const handleSelect = (item: MenuItem) => {
    if (item.disabled === true) return;
    item.onSelect();
    onClose?.();
  };

  return (
    <div role="menu" aria-label={label} className={cn('flex flex-col', className)}>
      {items.map((item, index) => (
        <button
          key={item.id}
          ref={(el) => {
            itemRefs.current[index] = el;
          }}
          type="button"
          role="menuitem"
          aria-disabled={item.disabled === true ? true : undefined}
          tabIndex={index === activeIndex ? 0 : -1}
          onClick={() => handleSelect(item)}
          onKeyDown={(e) => handleKeyDown(e, index)}
          onFocus={() => setActiveIndex(index)}
          // 파괴적 항목의 글자색: --color-danger 를 그대로 쓰면 본문 대비 4.5:1 을 넘지 못하므로
          // 같은 테마의 --color-text 를 섞어 어둡게(다크에선 밝게) 만든다(theme.md R9·R2 방식).
          style={
            item.destructive === true && item.disabled !== true
              ? { color: 'color-mix(in srgb, var(--color-danger) 70%, var(--color-text))' }
              : undefined
          }
          className={cn(
            'flex h-[var(--control-height)] items-center rounded-md px-[var(--space-3)] text-left text-base text-text',
            'hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            item.disabled === true && 'cursor-not-allowed text-faint hover:bg-transparent',
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
