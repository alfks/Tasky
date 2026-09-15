import { cn } from '@/lib/cn';

/** 접근 가능한 이름은 둘 중 하나로만 준다 — 둘 다 없으면 타입 에러(code-style §10). */
type CheckboxName = { label: string; labelledBy?: never } | { labelledBy: string; label?: never };

type CheckboxProps = CheckboxName & {
  checked: boolean;
  /** 다음 상태를 받는다. 낙관적 갱신은 사용처(스토어)가 한다. */
  onCheckedChange: (checked: boolean) => void;
  /** 삭제된 카테고리의 투두처럼 읽기 전용일 때(todo.md R16). */
  disabled?: boolean;
  id?: string;
  className?: string;
};

/**
 * 원형 체크박스. 실제 `input[type=checkbox]` 를 투명하게 덮어 32×32 클릭 영역과 키보드 조작
 * (`Space`)을 그대로 쓰고, 시각 표현만 형제 요소가 맡는다(todo.md 접근성, theme.md 3-D 컨트롤).
 * 체크 색은 `--cat-color`(사용처가 주입) → 없으면 강조색.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  label,
  labelledBy,
  className,
}: CheckboxProps) {
  return (
    <span
      className={cn(
        'relative inline-flex size-[var(--control-hit-min)] shrink-0 items-center justify-center',
        className,
      )}
    >
      <input
        type="checkbox"
        id={id}
        checked={checked}
        disabled={disabled}
        aria-label={label}
        aria-labelledby={labelledBy}
        onChange={(event) => onCheckedChange(event.target.checked)}
        className="peer absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
      />
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none size-[var(--control-checkbox-size)] rounded-full border-border bg-surface',
          '[border-width:var(--control-checkbox-border)] [border-style:solid]',
          'transition-colors duration-[var(--motion-fast)] ease-[var(--motion-ease)]',
          // 미체크 상태에서 테두리가 유일한 식별 수단이라 3:1 이상이 필요하다(theme.md R9).
          // --color-border 는 표면 대비 약 1.2:1 이라 여기서는 --color-muted 를 쓴다.
          'border-muted',
          'peer-enabled:peer-hover:border-[var(--cat-color,var(--color-accent))]',
          'peer-checked:border-[var(--cat-color,var(--color-accent))]',
          'peer-checked:bg-[var(--cat-color,var(--color-accent))]',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-focus',
          'peer-disabled:opacity-50',
        )}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className={cn(
          'pointer-events-none absolute size-[calc(var(--control-checkbox-size)*0.6)]',
          'stroke-on-accent opacity-0 peer-checked:opacity-100',
        )}
      >
        <path
          d="M5 12.5 10 17.5 19 7"
          fill="none"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
