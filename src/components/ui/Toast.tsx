'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

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

/**
 * 앱 전역 토스트 **허브** (app-shell.md R8 "동시에 1개").
 *
 * 왜 `features/` 가 아니라 여기인가: 토스트를 띄우는 곳은 `todo`·`category`·`backup`·`pwa`·`shell`
 * 다섯 feature 다. 허브가 어느 한 feature 안에 있으면 나머지가 그 feature 의 배럴을 import 해야 하는데,
 * 셸은 이미 그 feature 들을 import 하므로 곧바로 순환이 된다(`import/no-cycle` 실측:
 * `@/features/shell/components/AppShell:5=>@/features/todo:44`). `components/` 는 모든 feature 가
 * 의존해도 되는 아래층이라 순환이 생기지 않는다(FEATURE_ALLOW).
 *
 * zustand 를 쓰지 않는다 — `components` 레이어는 상태 라이브러리 금지 목록에 있다(eslint STORAGE).
 * 필요한 것은 "구독 + 스냅샷" 뿐이라 React 의 `useSyncExternalStore` 로 충분하다.
 *
 * 슬롯을 하나로 두지 **않고** 배열로 갖되 남는 수를 `MAX_VISIBLE_TOASTS` 로 자른다: 슬롯 하나면 앞
 * 토스트의 `[되돌리기]` 가 뒤 토스트로 **바뀌는** 순간 누르려던 대상이 사라진다. 배열이면 오래된
 * 것부터 통째로 밀려나므로 보이는 것과 눌리는 것이 항상 같다.
 */
export const MAX_VISIBLE_TOASTS = 1;

let hubToasts: readonly ToastItem[] = [];
let hubSequence = 0;
const hubListeners = new Set<() => void>();

function emit(next: readonly ToastItem[]): void {
  hubToasts = next;
  for (const listener of [...hubListeners]) listener();
}

/** 지금 떠 있는 토스트들. 뷰포트 밖(브리지·테스트)에서 동기적으로 볼 때 쓴다. */
export function getToasts(): readonly ToastItem[] {
  return hubToasts;
}

/** 띄운 토스트의 id — 호출부가 나중에 직접 닫거나 밀려났는지 확인할 때 쓴다. */
export function pushToast(toast: Omit<ToastItem, 'id'>): string {
  hubSequence += 1;
  const id = `toast-${hubSequence}`;
  emit([...hubToasts, { ...toast, id }].slice(-MAX_VISIBLE_TOASTS));
  return id;
}

export function dismissToast(id: string): void {
  if (!hubToasts.some((toast) => toast.id === id)) return;
  emit(hubToasts.filter((toast) => toast.id !== id));
}

export function clearToasts(): void {
  if (hubToasts.length === 0) return;
  emit([]);
}

function subscribeToasts(listener: () => void): () => void {
  hubListeners.add(listener);
  return () => {
    hubListeners.delete(listener);
  };
}

/** 허브를 구독한다. 뷰포트 하나(`ShellToasts`)와 브리지들이 쓴다. */
export function useToasts(): readonly ToastItem[] {
  return useSyncExternalStore(subscribeToasts, getToasts, getToasts);
}

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
 *
 * **앱에서 이것을 마운트하는 곳은 `ShellToasts` 하나뿐이다**(app-shell R8). feature 는 자기 뷰포트를
 * 띄우지 말고 위의 `pushToast` 로 허브에 밀어 넣는다.
 *
 * 아래쪽 여백은 `--space-6` 에 `--toast-bottom-reserve` 를 더한다. 후자는 좁은 화면의 하단 고정
 * `[+ 할 일]` 막대가 실제로 차지한 높이이고, 셸이 **재서** 문서 루트에 올려 준다
 * (`features/shell/lib/toast-stack.ts`). 값이 없으면 0 이라 넓은 화면은 그대로 24px 이다.
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
        'pointer-events-none fixed inset-x-0 z-[var(--z-toast)]',
        'bottom-[calc(var(--space-6)+var(--toast-bottom-reserve,0px))]',
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
