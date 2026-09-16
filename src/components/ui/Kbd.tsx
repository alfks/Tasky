import type { ReactNode } from 'react';

import { cn } from '@/lib/cn';

type KbdProps = {
  /** 키 이름 1개. 조합키는 `<Kbd>Ctrl</Kbd> + <Kbd>K</Kbd>` 처럼 나란히 둔다. */
  children: ReactNode;
  className?: string;
};

/** 단축키 표시 칩. 도움말 표와 메뉴의 보조 표기에 쓴다(shortcuts.md 접근성). */
export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={cn(
        'inline-flex items-center justify-center rounded-[var(--radius-sm)]',
        'border border-border bg-surface-2 px-[var(--space-2)]',
        'font-sans text-xs leading-normal font-semibold text-text',
        className,
      )}
    >
      {children}
    </kbd>
  );
}
