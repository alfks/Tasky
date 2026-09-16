'use client';

// "본문으로 건너뛰기" (app-shell.md R10). 문서의 **첫** 포커스 가능 요소이고, 포커스를 받을 때만 보인다.
import { SHELL_MAIN_ID } from '@/features/shell/components/ShellMain';

export function SkipLink() {
  return (
    <a
      href={`#${SHELL_MAIN_ID}`}
      className="sr-only rounded-[var(--radius-md)] bg-surface px-[var(--space-3)] py-[var(--space-2)] text-base font-semibold text-text shadow-md outline-2 outline-focus focus:not-sr-only focus:absolute focus:top-[var(--space-2)] focus:left-[var(--space-2)] focus:z-[var(--z-sticky)]"
    >
      본문으로 건너뛰기
    </a>
  );
}
