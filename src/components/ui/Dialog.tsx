'use client';

import { useEffect, useId, useRef } from 'react';
import type { ReactNode, RefObject } from 'react';

import { createPortal } from 'react-dom';

import { IconButton } from '@/components/ui/IconButton';
import {
  isInsideLayerAbove,
  isTopOverlayLayer,
  pushOverlayLayer,
} from '@/components/ui/overlay-stack';
import type { OverlayLayer } from '@/components/ui/overlay-stack';

import { cn } from '@/lib/cn';
import { isImeKey } from '@/lib/ime';

/** 브라우저 기본 탭 순서와 같은 집합 — 포커스 트랩이 이 목록을 순환한다. */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'summary',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

/** 보조기술·키보드 양쪽에서 빠져 있는 요소. 여기 걸리면 `.focus()` 가 무시돼 트랩이 제자리에 선다. */
function isHidden(el: HTMLElement): boolean {
  if (el.hasAttribute('hidden')) return true;
  if (el.getAttribute('aria-hidden') === 'true') return true;
  if (el.closest('[inert]') !== null) return true;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  return style?.display === 'none' || style?.visibility === 'hidden';
}

function focusablesIn(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (el) => !isHidden(el),
  );
}

/**
 * 모달이 열린 동안 배경을 보조기술에서 걷어낸다. `aria-modal` 만으로는 부족하다 — 지원이 조합마다
 * 들쭉날쭉하고 브라우저 페이지 내 검색·가상 커서는 막지 못한다(리뷰 M-6). 되돌리는 함수를 준다.
 */
function makeBackgroundInert(container: HTMLElement | null): () => void {
  if (container === null) return () => {};
  const marked = Array.from(container.ownerDocument.body.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement && el !== container && !el.hasAttribute('inert'),
  );
  marked.forEach((el) => el.setAttribute('inert', ''));
  return () => marked.forEach((el) => el.removeAttribute('inert'));
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
   * 열었던 요소가 **사라졌을 때만** 물어보는 대체 포커스 대상(app-shell R14: 같은 목록의 다음
   * 형제 → 이전 형제 → 목록 컨테이너). 열었던 요소가 아직 살아 있으면 묻지 않고 그리로 돌아간다 —
   * 취소로 닫았는데 포커스가 옆 행으로 가면 다음 Delete 가 엉뚱한 항목을 지운다(리뷰 M-3).
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

/**
 * 모달 대화상자. 포커스 트랩·Esc·바깥 클릭·배경 스크롤 잠금·포커스 복귀·배경 `inert` 와
 * **Enter/IME 규칙**(app-shell R14)을 책임진다. 선택지가 붙는 기능 전용 대화상자(category R10)도
 * 이 위에 지으면 같은 규칙을 그대로 물려받는다 — 규칙을 손으로 다시 구현할 필요가 없다.
 */
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
  const containerRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  // 레이어 신원은 컴포넌트 인스턴스마다 하나로 고정한다(스택이 동일성으로 비교한다).
  const layerRef = useRef<OverlayLayer>({
    contains: (node) => containerRef.current?.contains(node) ?? false,
  });

  // 콜백·ref prop 은 렌더마다 새 값일 수 있다. 아래 효과의 의존성에 넣으면 열려 있는 동안 트랩이
  // 매 렌더 재설치되고 openerRef 가 덮어써지므로, 최신 값만 여기 담아 두고 효과는 open 에만 반응한다.
  const latestRef = useRef({ initialFocusRef, returnFocus, onClose });
  useEffect(() => {
    latestRef.current = { initialFocusRef, returnFocus, onClose };
  });

  useEffect(() => {
    if (!open) return undefined;
    const layer = layerRef.current;
    const panel = panelRef.current;
    const opener = document.activeElement;
    openerRef.current = opener instanceof HTMLElement ? opener : null;
    const initial = latestRef.current.initialFocusRef?.current ?? focusablesIn(panel)[0] ?? panel;
    initial?.focus();

    const popLayer = pushOverlayLayer(layer);
    const restoreInert = makeBackgroundInert(containerRef.current);
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target;
      const inPanel = target instanceof Node && (panelRef.current?.contains(target) ?? false);

      // Enter 규칙(app-shell R14). 위 레이어(팝오버 등)가 있으면 그쪽 몫이므로 패널 안에서만 본다.
      if (e.key === 'Enter' && inPanel) {
        if (isImeKey(e)) {
          // 한글 조합을 확정하는 Enter. 여기서 끊지 않으면 폼 암묵 제출이 파괴 버튼을 누른다.
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // 포커스가 버튼·링크에 있으면 "그 버튼만" 실행 — 기본 동작을 그대로 둔다.
        if (target instanceof HTMLButtonElement || target instanceof HTMLAnchorElement) return;
        // 여러 줄 입력의 Enter 는 줄바꿈이다.
        if (target instanceof HTMLTextAreaElement) return;
        // 나머지(텍스트 입력 등)의 Enter 는 전부 막는다. 폼 암묵 제출도 이 기본 동작을 타고 온다.
        e.preventDefault();
        return;
      }

      if (e.key === 'Escape') {
        if (isImeKey(e)) return;
        // 맨 위 레이어만 Esc 를 소비한다 — 안에 열린 팝오버가 있으면 그것부터 닫힌다.
        if (!isTopOverlayLayer(layer)) return;
        e.preventDefault();
        e.stopPropagation();
        latestRef.current.onClose();
        return;
      }

      if (e.key !== 'Tab') return;
      // 위 레이어가 떠 있는 동안에는 그 레이어가 탭을 다룬다(트랩이 포커스를 빼앗지 않게).
      if (!isTopOverlayLayer(layer)) return;
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
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) === true) return;
      // 포털로 body 에 나간 위 레이어(팝오버 패널) 안쪽 클릭은 "바깥"이 아니다.
      if (isInsideLayerAbove(layer, target)) return;
      latestRef.current.onClose();
    };

    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('mousedown', handleMouseDown, true);
      restoreInert();
      popLayer();
      document.body.style.overflow = bodyOverflow;
      const previous = openerRef.current;
      // 열었던 요소가 살아 있으면 그리로. 사라졌을 때만 호출자에게 대체 대상을 묻는다(R14).
      const next =
        previous?.isConnected === true ? previous : (latestRef.current.returnFocus?.() ?? null);
      next?.focus();
    };
  }, [open]);

  if (!open) return null;
  // 포털이 없으면 transform/filter 조상 안에서 position:fixed 가 그 조상 기준이 되어 오버레이가
  // 뷰포트를 덮지 못한다(실측: 1280×720 대신 52px 로 접힘). 투두 행은 FLIP transform 을 쓴다(todo R8).
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={containerRef}
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-[var(--space-4)]"
    >
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
          'relative max-h-full w-full max-w-[440px] overflow-y-auto rounded-[var(--radius-xl)]',
          'border border-border bg-surface p-[var(--space-6)] shadow-md outline-none',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-[var(--space-3)]">
          <h2 id={titleId} className="text-lg font-semibold text-text">
            {title}
          </h2>
          <IconButton
            label={closeLabel}
            onClick={onClose}
            className="-mt-[var(--space-1)] -mr-[var(--space-2)]"
          >
            ✕
          </IconButton>
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
    </div>,
    document.body,
  );
}
