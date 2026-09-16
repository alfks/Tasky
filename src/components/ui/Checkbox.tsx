import { assertAccessibleName } from '@/lib/a11y';
import type { NonBlank } from '@/lib/a11y';
import { cn } from '@/lib/cn';

/**
 * 접근 가능한 이름은 둘 중 하나로만 준다 — 둘 다 없거나 둘 다 있으면 타입 에러(code-style §10).
 * 공백뿐인 리터럴도 타입에서 막고(`NonBlank`), 런타임 공백은 개발 모드에서 throw 한다.
 * `labelledBy` 가 **가리키는 요소**가 실제로 있는지·비어 있지 않은지는 검사하지 않는다(DOM 시점 문제).
 *
 * 어느 쪽을 쓰나: 화면에 보이는 제목이 그대로 이름인 자리(투두 행, todo.md R14)는 `labelledBy` 로
 * 그 제목 요소의 id 를 준다. `<label for>` 를 쓰면 제목 클릭이 체크 토글이 되어 R14 의 "제목 클릭 =
 * 편집 시작"과 충돌하므로, 제목은 버튼/입력으로 두고 연결은 `aria-labelledby` 로만 한다.
 * 보이는 제목이 없는 자리(설정 목록 등)에서만 `label` 을 쓴다.
 */
type CheckboxName<L extends string> =
  { label: L & NonBlank<L>; labelledBy?: never } | { labelledBy: L & NonBlank<L>; label?: never };

type CheckboxProps<L extends string> = CheckboxName<L> & {
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
export function Checkbox<L extends string>({
  checked,
  onCheckedChange,
  disabled = false,
  id,
  label,
  labelledBy,
  className,
}: CheckboxProps<L>) {
  // 둘 중 하나는 타입이 보장하지만(?: never 유니온), 컴파일러는 그 사실을 모아 주지 않는다.
  // '' 로 떨어지면 아래 가드가 그대로 잡는다.
  assertAccessibleName(
    'Checkbox',
    label === undefined ? 'labelledBy' : 'label',
    label ?? labelledBy ?? '',
  );

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
