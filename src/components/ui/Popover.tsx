'use client';

import { useEffect, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

import { cn } from '@/lib/cn';

/** 앵커와 패널 사이 간격(px). --space-2 와 같은 값이지만 위치 계산은 숫자가 필요하다. */
const GAP = 8;

/**
 * IME 조합 중에 생긴 키 이벤트인지. 조합을 취소하는 Esc 는 팝오버를 닫아서는 안 된다(app-shell R14).
 * 브라우저에 따라 isComposing 또는 keyCode 229 중 하나로만 알려 주므로 둘 다 본다.
 */
function isImeKey(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}

type PopoverPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

type PopoverProps = {
  /** 열림 여부. false 면 아무것도 렌더하지 않는다. */
  open: boolean;
  /** Esc·바깥 클릭으로 닫으려 할 때. */
  onClose: () => void;
  /** 위치 기준이 되는 요소(보통 여는 버튼). 닫힐 때 포커스도 여기로 돌아간다. */
  anchorRef: RefObject<HTMLElement | null>;
  /** 패널의 접근 이름. */
  label: string;
  /** 앵커 기준 위치. 기본 'bottom-start'. */
  placement?: PopoverPlacement;
  /** 열릴 때 첫 포커스 가능 요소로 포커스를 옮길지. 기본 true. */
  autoFocus?: boolean;
  children: ReactNode;
  className?: string;
};

/** 앵커에 붙는 비모달 오버레이. Esc·바깥 클릭으로 닫고, 닫히면 앵커로 포커스를 돌려준다(app-shell R7). */
export function Popover({
  open,
  onClose,
  anchorRef,
  label,
  placement = 'bottom-start',
  autoFocus = true,
  children,
  className,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);

  // 콜백은 렌더마다 새 값일 수 있어 효과 의존성에 넣지 않는다(넣으면 리스너가 매 렌더 재설치된다).
  const latestRef = useRef({ onClose });
  useEffect(() => {
    latestRef.current = { onClose };
  });

  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (autoFocus) {
      const first = panel?.querySelector<HTMLElement>(
        'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
      );
      (first ?? panel)?.focus();
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isImeKey(e)) return;
      e.preventDefault();
      e.stopPropagation();
      latestRef.current.onClose();
    };
    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) === true) return;
      if (anchorRef.current?.contains(target) === true) return;
      latestRef.current.onClose();
    };
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      // 정리 시점엔 패널 DOM 이 이미 떨어져 나가 ref 가 null 이므로 "안에 있었는지"를 물을 수 없다.
      // 대신 포커스가 사라져 body 로 떨어졌는지를 본다 — 그 경우에만 앵커로 돌려준다(app-shell R7).
      const active = document.activeElement;
      const lost = active === null || active === document.body;
      if (lost && anchor?.isConnected === true) anchor.focus();
    };
  }, [open, autoFocus, anchorRef]);

  // 위치는 앵커의 뷰포트 좌표에서 계산하고(position: fixed), 스크롤·리사이즈마다 다시 맞춘다.
  useEffect(() => {
    if (!open) return undefined;
    const update = () => {
      const anchor = anchorRef.current;
      const panel = panelRef.current;
      if (anchor === null || panel === null) return;
      const rect = anchor.getBoundingClientRect();
      const width = panel.offsetWidth;
      const height = panel.offsetHeight;
      const top = placement.startsWith('top') ? rect.top - height - GAP : rect.bottom + GAP;
      const left = placement.endsWith('end') ? rect.right - width : rect.left;
      const maxLeft = Math.max(GAP, window.innerWidth - width - GAP);
      const maxTop = Math.max(GAP, window.innerHeight - height - GAP);
      setPosition({
        top: Math.min(Math.max(GAP, top), maxTop),
        left: Math.min(Math.max(GAP, left), maxLeft),
      });
    };
    update();
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [open, placement, anchorRef]);

  if (!open) return null;

  return (
    <div
      ref={panelRef}
      role="group"
      aria-label={label}
      tabIndex={-1}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
      className={cn(
        'fixed z-[var(--z-popover)] min-w-[200px] rounded-lg border border-border bg-surface',
        'p-[var(--space-2)] shadow-md outline-none',
        'motion-safe:transition-opacity motion-safe:duration-[var(--motion-fast)]',
        position === null ? 'opacity-0' : 'opacity-100',
        className,
      )}
    >
      {children}
    </div>
  );
}
