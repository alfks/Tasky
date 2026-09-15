import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

/** 주 동작(강조색) · 보조 동작(배경 없음) · 파괴 동작(theme.md 3-A `--color-danger`). */
type ButtonVariant = 'primary' | 'ghost' | 'danger';
/** `md` = 컨트롤 기본 높이 36px, `sm` = 최소 클릭 영역 32px (theme.md 3-D 컨트롤). */
type ButtonSize = 'sm' | 'md';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** 진행 중 표시. 중복 실행을 막기 위해 비활성이 되고 `aria-busy` 가 붙는다. */
  loading?: boolean;
  children: ReactNode;
};

const VARIANT: Record<ButtonVariant, string> = {
  primary: 'bg-accent text-on-accent hover:enabled:opacity-90',
  ghost: 'bg-transparent text-text hover:enabled:bg-surface-2',
  danger: 'bg-danger text-on-accent hover:enabled:opacity-90',
};

const SIZE: Record<ButtonSize, string> = {
  sm: 'h-[var(--control-hit-min)] px-[var(--space-3)]',
  md: 'h-[var(--control-height)] px-[var(--space-4)]',
};

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  children,
  // 기본값을 button 으로 고정한다 — 대화상자·폼 안에서 암묵 제출이 일어나면 안 된다(app-shell R14).
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center gap-[var(--space-2)] rounded-[var(--radius-md)]',
        'text-base leading-normal font-semibold whitespace-nowrap',
        'transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

/** 로딩 표시. 회전은 `motion-safe` 로만 — 모션 축소 선호 시 정지한 원호로 남는다(theme.md R5). */
function Spinner() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="size-[var(--space-4)] shrink-0 motion-safe:animate-spin"
    >
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <path
        d="M8 2a6 6 0 0 1 6 6"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
