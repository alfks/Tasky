import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cn } from '@/lib/cn';

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  /**
   * 접근 가능한 이름. 아이콘에는 텍스트가 없으므로 필수다(code-style §10) — 빠뜨리면 타입 에러가 난다.
   */
  label: string;
  /** 아이콘 1개. 장식이므로 `aria-hidden` 처리된 자리에 들어간다. */
  children: ReactNode;
};

/** 아이콘 하나만 있는 버튼. 시각 크기와 무관하게 클릭 영역은 32×32 이상이다(theme.md 3-D 컨트롤). */
export function IconButton({
  label,
  className,
  children,
  // 암묵 제출 방지 — Button 과 같은 이유(app-shell R14).
  type = 'button',
  ...rest
}: IconButtonProps) {
  return (
    <button
      {...rest}
      type={type}
      aria-label={label}
      className={cn(
        'inline-flex size-[var(--control-hit-min)] shrink-0 items-center justify-center',
        'rounded-[var(--radius-md)] bg-transparent text-text',
        'transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
        'hover:enabled:bg-surface-2',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
    >
      <span aria-hidden="true" className="inline-flex items-center justify-center">
        {children}
      </span>
    </button>
  );
}
