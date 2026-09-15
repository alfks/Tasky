'use client';

import { useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

/** 액션이 있는 토스트는 6초, 없는 토스트는 3초 뒤 자동으로 닫힌다(app-shell R8). */
const DURATION_WITH_ACTION_MS = 6000;
const DURATION_MS = 3000;

type ToastAction = {
  /** 예: '되돌리기' */
  label: string;
  onAction: () => void;
};

type ToastProps = {
  /** 한 줄 문구. 예: "'장보기'를 삭제했어요" */
  message: string;
  /** 되돌리기 같은 액션. 있으면 기본 유지 시간이 6초가 된다. */
  action?: ToastAction;
  /** 에러 토스트는 role="alert" 로 즉시 낭독된다(app-shell §5). */
  variant?: 'default' | 'error';
  /** 유지 시간(ms). 기본값은 액션 유무로 정해진다. */
  durationMs?: number;
  /** 유지 시간이 끝났을 때. 실제로 지우는 것은 호출자 몫이다. */
  onClose: () => void;
  className?: string;
};

/** 하단 중앙 토스트. 자동 닫힘 타이머는 hover·포커스 중 멈춘다(app-shell R8). */
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
    <div className="pointer-events-none fixed inset-x-0 bottom-[var(--space-6)] z-[var(--z-toast)] flex justify-center px-[var(--space-4)]">
      {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- 호버·포커스는 자동 닫힘
          타이머를 멈출 뿐이고(app-shell R8) 조작 자체가 아니다. 실제 조작은 안의 [되돌리기] 버튼이
          받으며, 키보드 사용자에게는 그 버튼의 포커스가 같은 멈춤을 준다. */}
      <div
        role={variant === 'error' ? 'alert' : 'status'}
        aria-atomic="true"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={() => setPaused(false)}
        className={cn(
          'pointer-events-auto flex items-center gap-[var(--space-4)] rounded-lg border',
          'px-[var(--space-4)] py-[var(--space-3)] text-base shadow-md',
          'motion-safe:transition-opacity motion-safe:duration-[var(--motion-base)]',
          'bg-surface text-text',
          variant === 'error' ? 'border-danger' : 'border-border',
          className,
        )}
      >
        {/* 위험 색은 테두리와 이 표식(장식)에만 쓴다 — 문구를 --color-danger 로 칠하면
            본문 대비 4.5:1 을 넘지 못한다(theme.md R9). 의미는 role="alert" 가 전한다. */}
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
            className="shrink-0 rounded-md px-[var(--space-2)] py-[var(--space-1)] text-base font-semibold text-text underline underline-offset-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus"
          >
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
