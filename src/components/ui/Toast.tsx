'use client';

import { useEffect, useRef, useState } from 'react';

import { createPortal } from 'react-dom';

import { OVERLAY_ALWAYS_LIVE_ATTR } from '@/components/ui/overlay-rules';

import { cn } from '@/lib/cn';

/** 액션이 있는 토스트는 6초, 없는 토스트는 3초 뒤 자동으로 닫힌다(app-shell R8). */
const DURATION_WITH_ACTION_MS = 6000;
const DURATION_MS = 3000;

type ToastAction = {
  /** 예: '되돌리기' */
  label: string;
  onAction: () => void;
};

/** 에러 토스트는 assertive 영역에서 즉시 낭독된다(app-shell §5). */
type ToastVariant = 'default' | 'error';

export type ToastItem = {
  /** 목록 키이자 닫을 때 돌려주는 식별자. */
  id: string;
  /** 한 줄 문구. 예: "'장보기'를 삭제했어요" */
  message: string;
  /** 되돌리기 같은 액션. 있으면 기본 유지 시간이 6초가 된다. */
  action?: ToastAction;
  variant?: ToastVariant;
  /** 유지 시간(ms). 기본값은 액션 유무로 정해진다. */
  durationMs?: number;
};

type ToastViewportProps = {
  /** 지금 떠 있는 토스트들. 위에서 아래로 쌓인다. */
  toasts: readonly ToastItem[];
  /** 유지 시간이 끝났거나 닫아야 할 때. 실제로 목록에서 지우는 것은 호출자 몫이다. */
  onClose: (id: string) => void;
  className?: string;
};

/**
 * 토스트가 들어앉는 **상주 컨테이너**(app-shell §5).
 *
 * 라이브 영역은 내용보다 **먼저 DOM 에 있어야** 변경을 감지한다. `role="status"` 를 토스트마다
 * 붙이면 영역과 문구가 같은 순간에 삽입되어 상당수 스크린리더 조합에서 낭독되지 않는다(리뷰 M-4).
 * 그래서 영역 두 개(polite·assertive)를 토스트가 없을 때도 비워 둔 채 띄워 놓고, 토스트는 그 안에
 * 자식으로 들어간다. 세로로 쌓이므로 두 개가 동시에 떠도 겹치지 않는다(todo R10 + R13).
 *
 * 뷰포트는 `OVERLAY_ALWAYS_LIVE_ATTR` 를 달아 **모달이 배경을 `inert` 로 덮을 때 비켜 간다**.
 * 달지 않으면 대화상자가 떠 있는 동안 토스트가 AX 트리에서 사라지고 `[되돌리기]` 에 포커스가
 * 가지 않는다(리뷰 Major 2 실측) — 카테고리 삭제 되돌리기(category R15)가 바로 그 경로다.
 */
export function ToastViewport({ toasts, onClose, className }: ToastViewportProps) {
  if (typeof document === 'undefined') return null;
  const polite = toasts.filter((toast) => toast.variant !== 'error');
  const assertive = toasts.filter((toast) => toast.variant === 'error');

  const region = (toast: ToastItem) => (
    <Toast key={toast.id} {...toast} onClose={() => onClose(toast.id)} />
  );

  return createPortal(
    <div
      {...{ [OVERLAY_ALWAYS_LIVE_ATTR]: '' }}
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-[var(--space-6)] z-[var(--z-toast)]',
        'flex flex-col items-center gap-[var(--space-2)] px-[var(--space-4)]',
        className,
      )}
    >
      {/* aria-atomic 은 false 로 둔다 — 새로 들어온 토스트만 읽고 이미 떠 있던 것을 다시 읽지 않는다. */}
      <div
        role="status"
        aria-live="polite"
        aria-atomic="false"
        className="flex flex-col items-center gap-[var(--space-2)]"
      >
        {polite.map(region)}
      </div>
      <div
        role="alert"
        aria-live="assertive"
        aria-atomic="false"
        className="flex flex-col items-center gap-[var(--space-2)]"
      >
        {assertive.map(region)}
      </div>
    </div>,
    document.body,
  );
}

type ToastProps = Omit<ToastItem, 'id'> & {
  /** 유지 시간이 끝났을 때. */
  onClose: () => void;
  className?: string;
};

/**
 * 토스트 한 장. 스스로는 라이브 영역이 **아니다** — 낭독은 `ToastViewport` 의 상주 영역이 맡는다.
 * 자동 닫힘 타이머는 hover·포커스 중 멈춘다(app-shell R8).
 */
export function Toast({
  message,
  action,
  variant = 'default',
  durationMs,
  onClose,
  className,
}: ToastProps) {
  const total = durationMs ?? (action === undefined ? DURATION_MS : DURATION_WITH_ACTION_MS);
  const remainingRef = useRef(total);
  const [paused, setPaused] = useState(false);

  const latestRef = useRef({ onClose });
  useEffect(() => {
    latestRef.current = { onClose };
  });

  // 멈춤/재개마다 타이머를 새로 걸고, 정리할 때 남은 시간을 기록해 둔다 — 재개하면 그 시점부터 이어 간다.
  useEffect(() => {
    if (paused) return undefined;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => latestRef.current.onClose(), remainingRef.current);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAt));
    };
  }, [paused]);

  return (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- 호버·포커스는 자동 닫힘
       타이머를 멈출 뿐이고(app-shell R8) 조작 자체가 아니다. 실제 조작은 안의 [되돌리기] 버튼이
       받으며, 키보드 사용자에게는 그 버튼의 포커스가 같은 멈춤을 준다. */
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      className={cn(
        'pointer-events-auto flex items-center gap-[var(--space-4)] rounded-[var(--radius-lg)] border',
        'px-[var(--space-4)] py-[var(--space-3)] text-base shadow-md',
        'motion-safe:transition-opacity motion-safe:duration-[var(--motion-base)]',
        'bg-surface text-text',
        variant === 'error' ? 'border-danger' : 'border-border',
        className,
      )}
    >
      {/* 위험 색은 테두리와 이 표식(장식)에만 쓴다 — 문구를 --color-danger 로 칠하면
          본문 대비 4.5:1 을 넘지 못한다(theme.md R9). 의미는 assertive 영역이 전한다. */}
      {variant === 'error' ? (
        <span aria-hidden="true" className="text-danger">
          ⚠
        </span>
      ) : null}
      <span>{message}</span>
      {action === undefined ? null : (
        <button
          type="button"
          onClick={action.onAction}
          className="shrink-0 rounded-[var(--radius-md)] px-[var(--space-2)] py-[var(--space-1)] text-base font-semibold text-text underline underline-offset-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
