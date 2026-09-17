'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';

import { createPortal } from 'react-dom';

import { IconButton } from '@/components/ui/IconButton';
import { OVERLAY_ALWAYS_LIVE_ATTR } from '@/components/ui/overlay-rules';

import { cn } from '@/lib/cn';

/** 액션이 있는 토스트는 6초, 없는 토스트는 3초 뒤 자동으로 닫힌다(app-shell R8). */
const DURATION_WITH_ACTION_MS = 6000;
const DURATION_MS = 3000;

/**
 * `setTimeout` 이 실제로 받을 수 있는 최대 지연(ms) = 2^31-1 ≈ **24.8일**.
 *
 * 왜 상수로 두는가 — `Infinity` 를 넘기면 "안 닫힘" 이 아니라 **즉시 닫힘** 이 되기 때문이다.
 * 지연 인자는 HTML 규격에서 WebIDL `long`(32비트 부호 있는 정수)이라 넘기기 전에 `ToInt32` 가
 * 돌고, `ToInt32(Infinity) === 0` · `ToInt32(NaN) === 0` 이다 → 다음 틱에 바로 터진다.
 * Node(=jsdom) 는 같은 상황에서 `TimeoutOverflowWarning: Infinity does not fit into a 32-bit
 * signed integer. Timeout duration was set to 1.` 을 찍고 **1ms** 로 바꾼다(실측: 둘 다 11ms 뒤
 * 발화). 32비트를 넘는 유한값(`2147483648`)도 똑같이 1ms 로 접힌다 — 큰 수를 넣는 우회가
 * "오래 유지" 가 아니라 **즉시 닫힘** 으로 뒤집히는 지점이 바로 여기다.
 *
 * 그래서 "유지" 는 **큰 수가 아니라 타이머를 아예 걸지 않는 것**으로만 표현한다(`durationMs: null`).
 */
const TIMER_MAX_MS = 2_147_483_647;

/** ✕ 의 접근 이름. 토스트 문구에 따라 바꾸지 않는다 — 아래 `Toast` 주석 참고. */
export const TOAST_DISMISS_LABEL = '알림 닫기';

/**
 * 렌더할 유지 시간. `null` 이면 **자동으로 닫지 않는다**(타이머를 걸지 않는다).
 *
 * - `undefined`(기본): 액션 유무로 6초/3초.
 * - `null`: 유지. 사용자가 ✕ 를 누르거나 호출부가 `dismissToast` 할 때까지 남는다.
 * - 유한하지 않은 수(`Infinity`·`NaN`)와 `TIMER_MAX_MS` 이상: **유지로 접는다**. 타이머에 그대로
 *   넘기면 위 주석대로 즉시 닫히거나 24.8일 뒤 닫히는데, 둘 다 호출부의 의도("안 닫힘")가 아니다.
 */
export function resolveToastDuration(
  durationMs: number | null | undefined,
  hasAction: boolean,
): number | null {
  if (durationMs === undefined) return hasAction ? DURATION_WITH_ACTION_MS : DURATION_MS;
  if (durationMs === null) return null;
  if (!Number.isFinite(durationMs) || durationMs >= TIMER_MAX_MS) return null;
  return Math.max(0, durationMs);
}

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
  /**
   * 유지 시간(ms). 기본값은 액션 유무로 정해진다(6초/3초).
   * **`null` 은 "자동으로 닫지 않는다"** — 업데이트 알림처럼 사용자가 직접 닫아야 하는 토스트가 쓴다
   * (pwa R4 §2). 큰 수로 흉내내지 말 것: `resolveToastDuration` 주석 참고.
   */
  durationMs?: number | null;
  /**
   * ✕ 로 **사용자가 직접 닫았을 때**만 불린다(자동 닫힘·`dismissToast` 에서는 불리지 않는다).
   * 띄운 쪽이 "다시 올리지 않는다" 를 기억해야 할 때 쓴다 — PWA 업데이트 알림의 `dismissUpdate`
   * 가 이 경로다(pwa-store `isUpdateDismissed`). 없으면 그냥 화면에서만 사라진다.
   */
  onDismiss?: () => void;
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
 *
 * **✕ 는 모든 토스트에 있다**(pwa §2 는 업데이트 알림에만 그리지만 여기서 갈라 두지 않는다).
 * 자동으로 닫히는 토스트라도 hover·포커스 중에는 타이머가 멈추므로, ✕ 가 없으면 `[되돌리기]` 에
 * 포커스를 둔 키보드 사용자는 **토스트를 닫을 방법이 없다**(실측: 포커스 상태로 7초 넘게 생존).
 * 닫는 수단이 조건부면 그 상태를 학습할 수 없으니 항상 같은 자리에 둔다.
 *
 * **✕ 의 접근 이름은 토스트 문구에 따라 바뀌지 않는다**(`TOAST_DISMISS_LABEL` 고정). 토스트는
 * `role="status"`/`role="alert"` 상주 영역 **안**에 삽입되므로 삽입된 부분트리의 접근 이름이 전부
 * 낭독에 섞인다 — 이름에 문구를 넣으면("'삭제했어요' 알림 닫기") 한 번 뜰 때 같은 문구를 두 번
 * 읽는다. 화면에 남는 토스트는 하나뿐(`MAX_VISIBLE_TOASTS`)이라 짧은 고정 이름으로도 가리키는
 * 대상이 모호하지 않다.
 */
export function Toast({
  message,
  action,
  variant = 'default',
  durationMs,
  onDismiss,
  onClose,
  className,
}: ToastProps) {
  const total = resolveToastDuration(durationMs, action !== undefined);
  const remainingRef = useRef(total);
  const [paused, setPaused] = useState(false);
  // ✕ 를 누르면 이 토스트가 통째로 사라진다 — 그러면 포커스는 `<body>` 로 떨어지고 키보드
  // 사용자는 문서 처음부터 다시 Tab 해야 한다(실측: 닫은 직후 activeElement === BODY).
  // 그래서 **토스트 밖에서 들어온** 첫 포커스의 출발지를 기억해 두었다가 닫을 때 되돌려준다.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  const latestRef = useRef({ onClose });
  useEffect(() => {
    latestRef.current = { onClose };
  });

  // 멈춤/재개마다 타이머를 새로 걸고, 정리할 때 남은 시간을 기록해 둔다 — 재개하면 그 시점부터 이어 간다.
  useEffect(() => {
    if (paused) return undefined;
    // 유지(null)면 타이머를 **걸지 않는다**. 큰 수를 넣어 흉내내면 32비트 경계에서 뒤집힌다.
    const remaining = remainingRef.current;
    if (remaining === null) return undefined;
    const startedAt = Date.now();
    const timer = window.setTimeout(() => latestRef.current.onClose(), remaining);
    return () => {
      window.clearTimeout(timer);
      remainingRef.current = Math.max(0, remaining - (Date.now() - startedAt));
    };
  }, [paused]);

  return (
    /* eslint-disable-next-line jsx-a11y/no-static-element-interactions -- 호버·포커스는 자동 닫힘
       타이머를 멈출 뿐이고(app-shell R8) 조작 자체가 아니다. 실제 조작은 안의 [되돌리기] 버튼이
       받으며, 키보드 사용자에게는 그 버튼의 포커스가 같은 멈춤을 준다. */
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={(e) => {
        setPaused(true);
        // 안에서 [액션] ↔ [✕] 로 옮겨 다닐 때는 덮어쓰지 않는다 — 들어온 지점만 기억한다.
        const from = e.relatedTarget;
        if (from instanceof HTMLElement && !e.currentTarget.contains(from)) {
          returnFocusRef.current = from;
        }
      }}
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
      {/* 탭 순서는 DOM 순서 그대로 [액션] → [✕] 다. ✕ 가 마지막이라 액션을 건너뛰지 않는다. */}
      <IconButton
        label={TOAST_DISMISS_LABEL}
        onClick={() => {
          onDismiss?.();
          onClose();
          // 되돌릴 곳이 사라졌으면(그 요소도 같이 지워진 경우) 그대로 둔다 — 없는 곳으로 보낼 수 없다.
          const back = returnFocusRef.current;
          if (back?.isConnected === true) back.focus();
        }}
        className="-mr-[var(--space-2)]"
      >
        ✕
      </IconButton>
    </div>
  );
}
