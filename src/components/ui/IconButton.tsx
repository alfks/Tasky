import type { ComponentPropsWithRef, ReactNode } from 'react';

import { assertAccessibleName } from '@/lib/a11y';
import type { NonBlank } from '@/lib/a11y';
import { cn } from '@/lib/cn';

// aria-label 뿐 아니라 aria-labelledby 도 막는다 — accname 계산에서 aria-labelledby 가 label 을
// 이기므로, 열어 두면 엉뚱한(또는 존재하지 않는) 요소를 가리켜 이름이 바뀌거나 사라진다(리뷰 M-2).
// 다만 **타입 Omit 만으로는 막히지 않는다**: JSX 는 하이픈이 들어간 속성명을 초과 속성 검사에서
// 빼 준다(실측: bogusProp 은 TS2322, aria-labelledby 는 통과). 그래서 런타임에서도 걷어낸다.
// ref 는 ComponentPropsWithRef 로 들어온다(React 19, forwardRef 불필요) — Popover.anchorRef 가 쓴다.
type IconButtonProps<L extends string> = Omit<
  ComponentPropsWithRef<'button'>,
  'children' | 'aria-label' | 'aria-labelledby'
> & {
  /**
   * 접근 가능한 이름. 아이콘에는 텍스트가 없으므로 필수다(code-style §10).
   * 빠뜨리거나 공백뿐인 **리터럴**(`""`, `"   "`)이면 컴파일되지 않고, 런타임에 계산된 공백은
   * 개발 모드에서 throw 한다. 막지 못하는 경로는 `@/lib/a11y` 문서 표에 적어 두었다.
   */
  label: L & NonBlank<L>;
  /** 아이콘 1개. 장식이므로 `aria-hidden` 처리된 자리에 들어간다. */
  children: ReactNode;
};

/** 아이콘 하나만 있는 버튼. 시각 크기와 무관하게 클릭 영역은 32×32 이상이다(theme.md 3-D 컨트롤). */
export function IconButton<L extends string>({
  label,
  className,
  children,
  // 암묵 제출 방지 — Button 과 같은 이유(app-shell R14).
  type = 'button',
  ...rest
}: IconButtonProps<L>) {
  assertAccessibleName('IconButton', 'label', label);
  const { 'aria-labelledby': _labelledBy, ...safeRest } = rest as typeof rest & {
    'aria-labelledby'?: string;
  };

  return (
    <button
      {...safeRest}
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
