'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';

import { cn } from '@/lib/cn';

/** 브라우저 기본 탭 순서와 같은 집합 — 포커스 트랩이 이 목록을 순환한다. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function focusablesIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => el.getAttribute('aria-hidden') !== 'true',
  );
}

/**
 * IME 조합 중에 생긴 키 이벤트인지. 한글 입력에서 조합을 확정·취소하는 Enter·Esc 는 조합을
 * 끝내는 동작일 뿐이라 대화상자를 닫거나 버튼을 실행해서는 안 된다(app-shell R14).
 * 브라우저에 따라 isComposing 또는 keyCode 229 중 하나로만 알려 주므로 둘 다 본다.
 */
function isImeKey(e: KeyboardEvent): boolean {
  return e.isComposing || e.keyCode === 229;
}

type DialogProps = {
  /** 열림 여부. false 면 아무것도 렌더하지 않는다. */
  open: boolean;
  /** Esc·바깥 클릭·✕ 로 닫으려 할 때. 실제로 닫는 것(open=false)은 호출자 몫이다. */
  onClose: () => void;
  /** 제목. aria-labelledby 로 연결된다. */
  title: ReactNode;
  /** 제목 아래 설명. 있으면 aria-describedby 로 연결된다. */
  description?: ReactNode;
  /** 파괴적 확인은 'alertdialog'(app-shell R14). 기본은 'dialog'. */
  role?: 'dialog' | 'alertdialog';
  /** 열릴 때 포커스를 받을 요소. 없으면 첫 포커스 가능 요소, 그것도 없으면 패널. */
  initialFocusRef?: RefObject<HTMLElement | null>;
  /**
   * 닫힐 때 포커스를 줄 요소를 고른다. 열었던 요소가 확인의 결과로 사라지는 경우
   * (삭제된 목록 행의 `⋯` 버튼 등) 호출자가 다음 형제를 돌려준다(app-shell R14).
   * 돌려주는 값이 없으면 열었던 요소가 아직 살아 있을 때만 그리로 복귀한다.
   */
  returnFocus?: () => HTMLElement | null;
  /** 본문. */
  children?: ReactNode;
  /** 하단 버튼 영역. */
  footer?: ReactNode;
  /** 패널에 덧붙일 클래스(폭 등). */
  className?: string;
  /** ✕ 버튼의 접근 이름. */
  closeLabel?: string;
};

/** 모달 대화상자. 포커스 트랩·Esc·바깥 클릭·배경 스크롤 잠금·포커스 복귀를 책임진다(app-shell R7·R14). */
export function Dialog({
  open,
  onClose,
  title,
  description,
  role = 'dialog',
  initialFocusRef,
  returnFocus,
  children,
  footer,
  className,
  closeLabel = '닫기',
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // 콜백·ref prop 은 렌더마다 새 값일 수 있다. 아래 효과의 의존성에 넣으면 열려 있는 동안 트랩이
  // 매 렌더 재설치되고 openerRef 가 덮어써지므로, 최신 값만 여기 담아 두고 효과는 open 에만 반응한다.
  const latestRef = useRef({ initialFocusRef, returnFocus, onClose });
  useEffect(() => {
    latestRef.current = { initialFocusRef, returnFocus, onClose };
  });

  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    const opener = document.activeElement;
    openerRef.current = opener instanceof HTMLElement ? opener : null;
    const initial = latestRef.current.initialFocusRef?.current ?? focusablesIn(panel)[0] ?? panel;
    initial?.focus();

    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isImeKey(e)) return;
        e.preventDefault();
        e.stopPropagation();
        latestRef.current.onClose();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusablesIn(panelRef.current);
      if (items.length === 0) {
        e.preventDefault();
        panelRef.current?.focus();
        return;
      }
      const active = document.activeElement;
      const edge = e.shiftKey ? items[0] : items[items.length - 1];
      const inside = active instanceof Node && (panelRef.current?.contains(active) ?? false);
      if (!inside || active === edge) {
        e.preventDefault();
        (e.shiftKey ? items[items.length - 1] : items[0]).focus();
      }
    };

    const handleMouseDown = (e: MouseEvent) => {
      const target = e.target;
      if (target instanceof Node && (panelRef.current?.contains(target) ?? false)) return;
      latestRef.current.onClose();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      document.body.style.overflow = bodyOverflow;
      const previous = openerRef.current;
      const next =
        latestRef.current.returnFocus?.() ?? (previous?.isConnected ? previous : null) ?? null;
      next?.focus();
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-[var(--space-4)]">
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{ backgroundColor: 'color-mix(in srgb, var(--color-faint) 45%, transparent)' }}
      />
      <div
        ref={panelRef}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description === undefined ? undefined : descriptionId}
        tabIndex={-1}
        className={cn(
          'relative max-h-full w-full max-w-[440px] overflow-y-auto rounded-xl',
          'border border-border bg-surface p-[var(--space-6)] shadow-md outline-none',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-[var(--space-3)]">
          <h2 id={titleId} className="text-lg font-semibold text-text">
            {title}
          </h2>
          <button
            type="button"
            aria-label={closeLabel}
            onClick={onClose}
            className="-mt-[var(--space-1)] -mr-[var(--space-2)] flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            <span aria-hidden="true">✕</span>
          </button>
        </div>
        {description === undefined ? null : (
          <div id={descriptionId} className="mt-[var(--space-3)] text-base text-muted">
            {description}
          </div>
        )}
        {children === undefined ? null : <div className="mt-[var(--space-4)]">{children}</div>}
        {footer === undefined ? null : (
          <div className="mt-[var(--space-6)] flex justify-end gap-[var(--space-2)]">{footer}</div>
        )}
      </div>
    </div>
  );
}
