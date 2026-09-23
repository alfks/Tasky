'use client';

import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

import { cn } from '@/lib/cn';
import { isImeKey } from '@/lib/ime';

/** 타이핑 이동 버퍼가 살아 있는 시간(ms). 이 시간이 지나면 다음 글자는 새 검색으로 친다. */
const TYPEAHEAD_RESET_MS = 500;

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
  /**
   * 항목 높이·안쪽 여백을 `--control-hit-min`(32px)까지 줄인다(기본 `--control-height` 36px,
   * 사용자 결정 — "메뉴 옵션 간격이 좁아 마우스 피로도가 낮았으면"). 항목 사이에 실제 `gap` 은
   * 원래 0 이라(줄마다 바로 붙어 있다) 줄일 여지는 각 항목의 히트 높이뿐이고, 32px 는 WCAG
   * 2.5.8(AA) 최소 24px 위 여유이자 이 앱이 이미 "촘촘함"에 쓰는 값(`RadioOption`·행 밀도 등)과
   * 같다 — 여기서만 새 숫자를 만들지 않는다. 항목이 유난히 많은 메뉴(todo `⋯`)에만 쓴다.
   */
  dense?: boolean;
};

/**
 * 키보드로 다룰 수 있는 메뉴 목록(role="menu"). 위치·바깥 클릭은 Popover 가 맡고,
 * 여기서는 항목 사이 이동(↑↓·Home/End·타이핑)과 실행만 책임진다.
 */
export function Menu({
  label,
  items,
  onClose,
  autoFocus = true,
  className,
  dense = false,
}: MenuProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const typeaheadRef = useRef({ buffer: '', at: 0 });
  const [activeIndex, setActiveIndex] = useState(0);

  useEffect(() => {
    if (autoFocus) itemRefs.current[0]?.focus();
  }, [autoFocus]);

  const focusAt = (index: number) => {
    if (items.length === 0) return;
    const next = (index + items.length) % items.length;
    setActiveIndex(next);
    itemRefs.current[next]?.focus();
  };

  /**
   * 타이핑 이동. **한국어 라벨에서는 사실상 동작하지 않는다**: 메뉴 항목은 편집 가능한 요소가
   * 아니라 IME 조합이 걸리지 않고, 조합 없는 keydown 은 라틴 자판 문자로 도착한다(실측).
   * 영문·숫자 라벨에서만 유효하다. 초성 매칭은 별도 티켓 건.
   */
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
    // Popover 안에 들어가면 위치·바깥 클릭·Esc 는 Popover 가 맡는다. 이름은 여기 하나만 둔다.
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
            'flex items-center rounded-[var(--radius-md)] text-left text-base text-text',
            dense
              ? 'h-[var(--control-hit-min)] px-[var(--space-2)]'
              : 'h-[var(--control-height)] px-[var(--space-3)]',
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
