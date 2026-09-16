'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

import { createPortal } from 'react-dom';

import { isTopOverlayLayer, pushOverlayLayer } from '@/components/ui/overlay-stack';
import type { OverlayLayer } from '@/components/ui/overlay-stack';

import { cn } from '@/lib/cn';
import { isImeKey } from '@/lib/ime';

/** 앵커와 패널 사이 간격(px). --space-2 와 같은 값이지만 위치 계산은 숫자가 필요하다. */
const GAP = 8;

const FOCUSABLE_SELECTOR =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

type PopoverPlacement = 'bottom-start' | 'bottom-end' | 'top-start' | 'top-end';

type PopoverProps = {
  /** 열림 여부. false 면 아무것도 렌더하지 않는다. */
  open: boolean;
  /** Esc·바깥 클릭으로 닫으려 할 때. */
  onClose: () => void;
  /**
   * 위치 기준이 되는 요소(보통 여는 버튼). 닫힐 때 포커스도 여기로 돌아가고,
   * 열려 있는 동안 `aria-haspopup`·`aria-expanded`·`aria-controls` 가 이 요소에 붙는다.
   * 앵커 쪽에서 같은 속성을 직접 쓰지 않는다(두 벌이 되면 어긋난다).
   */
  anchorRef: RefObject<HTMLElement | null>;
  /**
   * 패널의 접근 이름. **자식이 이미 이름 있는 역할을 만들 때(예: `Menu` 의 `role="menu"`)는 생략한다** —
   * 주면 같은 이름이 button → group → menu 로 세 번 낭독된다(리뷰 M-5).
   */
  label?: string;
  /** 앵커가 여는 것이 무엇인지. `aria-haspopup` 값이 된다. 기본 'true'(일반 팝오버). */
  hasPopup?: 'true' | 'menu' | 'listbox' | 'tree' | 'grid' | 'dialog';
  /** 앵커 기준 위치. 기본 'bottom-start'. */
  placement?: PopoverPlacement;
  /** 열릴 때 첫 포커스 가능 요소로 포커스를 옮길지. 기본 true. */
  autoFocus?: boolean;
  /**
   * 닫을 때 **앵커가 이미 사라졌으면** 물어보는 대체 포커스 대상(app-shell R14: 다음 형제 →
   * 이전 형제 → 목록 컨테이너). 없으면 포커스가 `body` 로 떨어진다 — R14 가 금지하는 상태다.
   */
  returnFocus?: () => HTMLElement | null;
  children: ReactNode;
  className?: string;
};

/** 앵커에 붙는 비모달 오버레이. Esc·바깥 클릭으로 닫고, 닫히면 앵커로 포커스를 돌려준다(app-shell R7). */
export function Popover({
  open,
  onClose,
  anchorRef,
  label,
  hasPopup = 'true',
  placement = 'bottom-start',
  autoFocus = true,
  returnFocus,
  children,
  className,
}: PopoverProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const layerRef = useRef<OverlayLayer>({
    contains: (node) => panelRef.current?.contains(node) ?? false,
  });

  // 콜백은 렌더마다 새 값일 수 있어 효과 의존성에 넣지 않는다(넣으면 리스너가 매 렌더 재설치된다).
  const latestRef = useRef({ onClose, returnFocus });
  useEffect(() => {
    latestRef.current = { onClose, returnFocus };
  });

  // 앵커 쪽 배선. 앵커는 이 컴포넌트가 그리지 않으므로 속성을 직접 붙이고, 닫힐 때 되돌린다.
  useEffect(() => {
    const anchor = anchorRef.current;
    if (anchor === null) return undefined;
    const before = {
      hasPopup: anchor.getAttribute('aria-haspopup'),
      expanded: anchor.getAttribute('aria-expanded'),
      controls: anchor.getAttribute('aria-controls'),
    };
    anchor.setAttribute('aria-haspopup', hasPopup);
    anchor.setAttribute('aria-expanded', String(open));
    if (open) anchor.setAttribute('aria-controls', panelId);
    else anchor.removeAttribute('aria-controls');
    return () => {
      const restore = (name: string, value: string | null) => {
        if (value === null) anchor.removeAttribute(name);
        else anchor.setAttribute(name, value);
      };
      restore('aria-haspopup', before.hasPopup);
      restore('aria-expanded', before.expanded);
      restore('aria-controls', before.controls);
    };
  }, [open, hasPopup, panelId, anchorRef]);

  useEffect(() => {
    if (!open) return undefined;
    const layer = layerRef.current;
    const panel = panelRef.current;
    const anchor = anchorRef.current;
    if (autoFocus) {
      const first = panel?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      (first ?? panel)?.focus();
    }

    const popLayer = pushOverlayLayer(layer);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || isImeKey(e)) return;
      // 맨 위 레이어만 Esc 를 소비한다 — 대화상자 안의 팝오버는 자기만 닫고 대화상자는 남긴다.
      if (!isTopOverlayLayer(layer)) return;
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
      popLayer();
      // 정리 시점엔 패널 DOM 이 이미 떨어져 나가 ref 가 null 이므로 "안에 있었는지"를 물을 수 없다.
      // 대신 포커스가 사라져 body 로 떨어졌는지를 본다 — 그 경우에만 되돌린다(app-shell R7·R14).
      const active = document.activeElement;
      const lost = active === null || active === document.body;
      if (!lost) return;
      // 앵커가 살아 있으면 앵커로, 앵커까지 사라졌으면(행 삭제) 호출자가 준 대체 대상으로.
      const next =
        anchor?.isConnected === true ? anchor : (latestRef.current.returnFocus?.() ?? null);
      next?.focus();
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
  // 포털이 없으면 transform 조상(투두 행의 FLIP 모션, todo R8) 안에서 fixed 좌표가 그 조상 기준이
  // 되어 패널이 앵커에서 161×262px 어긋났다(실측). body 로 내보내면 뷰포트 좌표가 그대로 맞는다.
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={panelRef}
      id={panelId}
      // 자식이 이미 role=menu 등으로 이름을 가지면 여기에 role/이름을 주지 않는다(3연속 낭독 방지).
      role={label === undefined ? undefined : 'group'}
      aria-label={label}
      tabIndex={-1}
      style={{ top: position?.top ?? 0, left: position?.left ?? 0 }}
      className={cn(
        'fixed z-[var(--z-popover)] min-w-[200px] rounded-[var(--radius-lg)] border border-border bg-surface',
        'p-[var(--space-2)] shadow-md outline-none',
        'motion-safe:transition-opacity motion-safe:duration-[var(--motion-fast)]',
        position === null ? 'opacity-0' : 'opacity-100',
        className,
      )}
    >
      {children}
    </div>,
    document.body,
  );
}
