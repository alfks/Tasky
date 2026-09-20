'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode, RefObject } from 'react';

import { createPortal } from 'react-dom';

import { IconButton } from '@/components/ui/IconButton';
import { OVERLAY_ALWAYS_LIVE_ATTR, applyOverlayEnterRule } from '@/components/ui/overlay-rules';
import {
  isInsideLayerAbove,
  isTopOverlayLayer,
  overlayLayersAbove,
  overlayZIndex,
  pushOverlayLayer,
} from '@/components/ui/overlay-stack';
import type { OverlayLayer } from '@/components/ui/overlay-stack';

import { cn } from '@/lib/cn';
import { isImeKey } from '@/lib/ime';

/** `--z-modal`(tokens.css) 의 JS 거울 — `overlayZIndex` 가 스택 깊이에 맞춰 이 값 이상을 계산한다. */
export const BASE_Z_MODAL = 30;

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
 *
 * 두 가지는 덮지 않는다.
 * 1. `OVERLAY_ALWAYS_LIVE_ATTR` 를 단 형제 = 토스트 뷰포트. 덮으면 모달이 떠 있는 동안 토스트가
 *    AX 트리에서 사라지고 `[되돌리기]` 에 포커스가 가지 않는다(app-shell §5·R8, 리뷰 Major 2).
 * 2. **열린 뒤에 body 에 붙는 형제.** 스냅샷만 덮으므로 나중에 마운트되는 포털은 대상이 아닌데,
 *    그게 맞다 — 나중에 붙는 것은 이 모달보다 **위** 레이어(팝오버 패널·중첩 대화상자)이고
 *    토스트 뷰포트는 마운트 시점과 무관하게 1번 규칙으로 살아남는다.
 * 이미 `inert` 인 형제는 건드리지도 기록하지도 않으므로, 중첩 대화상자의 안쪽을 닫아도 바깥
 * 대화상자가 걸어 둔 `inert` 는 남는다.
 */
function makeBackgroundInert(container: HTMLElement | null): () => void {
  if (container === null) return () => {};
  const marked = Array.from(container.ownerDocument.body.children).filter(
    (el): el is HTMLElement =>
      el instanceof HTMLElement &&
      el !== container &&
      !el.hasAttribute(OVERLAY_ALWAYS_LIVE_ATTR) &&
      !el.hasAttribute('inert'),
  );
  marked.forEach((el) => el.setAttribute('inert', ''));
  return () => marked.forEach((el) => el.removeAttribute('inert'));
}

/**
 * Tab 을 오버레이 안에 가둔다(app-shell R14).
 *
 * 위 레이어가 **스스로 가두면**(중첩 대화상자) 그쪽에 맡기고 물러난다. 하지만 위에 있는 것이
 * 가두지 않는 레이어(팝오버)뿐이라면 여기서 물러나는 순간 **아무도 가두지 않는다** — 실제로
 * 모달 안에서 팝오버를 열고 Tab 6회를 누르면 포커스가 `body` 로 떨어졌다(리뷰 Major 1). 그래서
 * 그런 레이어들은 순환 집합에 **합쳐서** 여기서 함께 가둔다.
 */
function trapTab(e: KeyboardEvent, layer: OverlayLayer, panel: HTMLElement | null): void {
  const above = overlayLayersAbove(layer);
  if (above.some((other) => other.traps === true)) return;
  const roots = [panel, ...above.map((other) => other.element?.() ?? null)];
  const items = roots.flatMap(focusablesIn);
  if (items.length === 0) {
    e.preventDefault();
    panel?.focus();
    return;
  }
  const active = document.activeElement;
  const edge = e.shiftKey ? items[0] : items[items.length - 1];
  const inside = active instanceof Node && roots.some((root) => root?.contains(active) === true);
  if (!inside || active === edge) {
    e.preventDefault();
    (e.shiftKey ? items[items.length - 1] : items[0]).focus();
  }
}

/** 오버레이가 캡처 단계에서 받는 키. Enter(R14) · Esc(맨 위 레이어만) · Tab(트랩) 셋만 다룬다. */
function handleDialogKey(
  e: KeyboardEvent,
  layer: OverlayLayer,
  panel: HTMLElement | null,
  onClose: () => void,
): void {
  if (e.key === 'Enter') {
    // 위 레이어(팝오버 등)는 자기 패널 안의 Enter 를 스스로 본다.
    const target = e.target;
    if (target instanceof Node && panel?.contains(target) === true) applyOverlayEnterRule(e);
    return;
  }
  if (e.key === 'Escape') {
    // 맨 위 레이어만 Esc 를 소비한다 — 안에 열린 팝오버가 있으면 그것부터 닫힌다.
    if (isImeKey(e) || !isTopOverlayLayer(layer)) return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
    return;
  }
  if (e.key === 'Tab') trapTab(e, layer, panel);
}

/**
 * 포털로 body 에 나간 위 레이어(팝오버 패널) 안쪽 클릭은 "바깥"이 아니다.
 *
 * `OVERLAY_ALWAYS_LIVE_ATTR` 를 단 루트(= 토스트 뷰포트) **안쪽도 바깥이 아니다.** 그 표식은
 * `makeBackgroundInert` 에서만 쓰이고 있었는데, 그래서 모달이 떠 있는 동안 토스트는 살아 있으면서도
 * 그 `[되돌리기]` 를 **마우스로** 누르면 모달까지 닫혔다(T-29 실측 · T-29 이전부터 있던 결함).
 * 뷰포트는 오버레이 스택에 없으므로(`pushOverlayLayer` 는 DOM 을 그리는 오버레이 전용 — T-44)
 * `isInsideLayerAbove` 가 잡지 못한다. 표식 자체가 이미 "모달이 있어도 살아 있는 영역" 을 뜻하니
 * 새 표식을 만들지 않고 그것을 그대로 읽는다.
 *
 * 범위는 **그 표식을 단 부분트리 안쪽**뿐이다. 문서에 뷰포트가 존재하는지로 판단하면 진짜 바깥
 * 클릭(백드롭)까지 살아남아 모달이 영영 안 닫힌다.
 */
function isOutsideClick(e: MouseEvent, layer: OverlayLayer, panel: HTMLElement | null): boolean {
  const target = e.target;
  if (!(target instanceof Node)) return false;
  if (panel?.contains(target) === true) return false;
  const el = target instanceof Element ? target : target.parentElement;
  if (el?.closest(`[${OVERLAY_ALWAYS_LIVE_ATTR}]`) != null) return false;
  return !isInsideLayerAbove(layer, target);
}

/** 닫힐 때 — 열었던 요소가 살아 있으면 그리로, 사라졌을 때만 호출자에게 대체 대상을 묻는다(R14). */
function restoreFocus(previous: HTMLElement | null, fallback?: () => HTMLElement | null): void {
  const next = previous?.isConnected === true ? previous : (fallback?.() ?? null);
  next?.focus();
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
    traps: true,
    element: () => panelRef.current,
  });

  /**
   * z-index 는 **열리는 순간**(렌더 중, `open` 이 false→true 로 바뀌는 그 렌더) 한 번만 계산해
   * 고정한다 — `useEffect` 안에서 계산하면 이미 자기 레이어가 스택에 올라간 **다음** 렌더부터
   * `overlayZIndex` 가 자기 자신을 "이미 열려 있는 레이어"로 세어 매번 값이 올라간다(자기 자신을
   * 넘어서려는 계산이 되어 버린다). 렌더 중 파생 상태 갱신(React 공식 패턴)이라 플래시도 없다 —
   * `pushOverlayLayer` 가 도는 효과보다 먼저 커밋에 반영된다.
   */
  const [z, setZ] = useState(BASE_Z_MODAL);
  // `useRef(open)` 이면 **열린 채로 마운트되는** 대화상자(예: 대화상자 안에서 여는 또 다른
  // 대화상자)는 초깃값이 이미 `true` 라 아래 조건이 첫 렌더부터 거짓이 되어 계산이 한 번도 안
  // 돈다(리뷰 #104 라운드2 Minor-1 실측: 30/30). 항상 `false` 로 시작해야 "닫혀 있다가 열리는"
  // 것과 "열린 채 마운트되는" 것 양쪽 모두 첫 렌더에서 한 번 계산한다.
  const wasOpenRef = useRef(false);
  if (open && !wasOpenRef.current) setZ(overlayZIndex(BASE_Z_MODAL));
  wasOpenRef.current = open;

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

    const popLayer = pushOverlayLayer(layer, BASE_Z_MODAL);
    const restoreInert = makeBackgroundInert(containerRef.current);
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (e: KeyboardEvent) =>
      handleDialogKey(e, layer, panelRef.current, latestRef.current.onClose);
    const handleMouseDown = (e: MouseEvent) => {
      if (!isOutsideClick(e, layer, panelRef.current)) return;
      // 백드롭은 포커스 가능한 요소가 아니다. mousedown 의 기본 동작을 그대로 두면 브라우저가
      // **디스패치가 끝난 뒤** 포커스를 `<body>` 로 옮기는데, 그 시점은 여기서 부른 onClose 가
      // 일으킨 언마운트·포커스 복귀보다 **나중**이라 복귀가 그대로 덮인다. Chromium 실측 순서:
      // `복귀(focusin → 여는 요소)` → `mousedown 리스너 종료` → `focusout → BODY`. 그래서 복귀
      // 로직을 아무리 고쳐도 소용이 없고, 기본 동작을 막는 것이 유일한 지점이다(T-35).
      e.preventDefault();
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
      restoreFocus(openerRef.current, latestRef.current.returnFocus);
    };
  }, [open]);

  if (!open) return null;
  // 포털이 없으면 transform/filter 조상 안에서 position:fixed 가 그 조상 기준이 되어 오버레이가
  // 뷰포트를 덮지 못한다(실측: 1280×720 대신 52px 로 접힘). 투두 행은 FLIP transform 을 쓴다(todo R8).
  if (typeof document === 'undefined') return null;

  return createPortal(
    <div
      ref={containerRef}
      // 고정 토큰(z-[var(--z-modal)]) 대신 인라인으로 준다 — 대화상자 안에서 또 대화상자를 열거나
      // (중첩) 팝오버를 열 때 `overlayZIndex` 가 계산한, 이미 열린 레이어들보다 항상 높은 값이다.
      style={{ zIndex: z }}
      className="fixed inset-0 flex items-center justify-center p-[var(--space-4)]"
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
