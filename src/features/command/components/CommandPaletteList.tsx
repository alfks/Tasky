/**
 * 팔레트의 결과 목록(shortcuts §5).
 *
 * 접근성 모양이 요점이다: 포커스는 **입력칸에만** 있고(그래야 계속 칠 수 있다) 선택은
 * `aria-activedescendant` 로 가리킨다. 그래서 항목은 `tabIndex` 를 갖지 않고 `role="option"` 만
 * 갖는다 — `button` 으로 만들면 role 이 덮여 낭독기가 목록의 몇 번째인지 말하지 못한다.
 */
import type {
  PaletteOption,
  PaletteSection,
} from '@/features/command/components/CommandPaletteOptions';
import { ShortcutKeys } from '@/features/command/components/ShortcutKeys';
import { chordsOf } from '@/features/command/store/shortcut-registry';

import { cn } from '@/lib/cn';

type CommandPaletteListProps = {
  /** 입력칸의 `aria-controls` 가 가리키는 id. */
  listId: string;
  sections: readonly PaletteSection[];
  /** 지금 선택된 자리(평평하게 센 번호). */
  activeIndex: number;
  /** 평평한 번호 → DOM id. `aria-activedescendant` 와 같은 함수를 쓴다. */
  optionId: (index: number) => string;
  /** 클릭·Enter 로 실행. */
  onRun: (option: PaletteOption) => void;
  /** 마우스를 얹으면 선택이 따라온다 — 키보드로 옮긴 선택과 같은 상태를 쓴다. */
  onHover: (index: number) => void;
  isMac: boolean;
};

export function CommandPaletteList({
  listId,
  sections,
  activeIndex,
  optionId,
  onRun,
  onHover,
  isMac,
}: CommandPaletteListProps) {
  let index = -1;
  return (
    <div
      role="listbox"
      id={listId}
      aria-label="명령과 할 일"
      className="mt-[var(--space-2)] max-h-[min(50vh,360px)] overflow-y-auto"
    >
      {sections.map((section) => (
        <div key={section.id} role="group" aria-label={section.label}>
          <p
            aria-hidden="true"
            className="px-[var(--space-3)] pt-[var(--space-3)] pb-[var(--space-1)] text-xs font-semibold text-muted"
          >
            {section.label}
          </p>
          {section.options.map((option) => {
            index += 1;
            return (
              <PaletteRow
                key={option.key}
                option={option}
                id={optionId(index)}
                selected={index === activeIndex}
                index={index}
                onRun={onRun}
                onHover={onHover}
                isMac={isMac}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

type PaletteRowProps = {
  option: PaletteOption;
  id: string;
  selected: boolean;
  index: number;
  onRun: (option: PaletteOption) => void;
  onHover: (index: number) => void;
  isMac: boolean;
};

/**
 * 항목 한 줄. 키보드 처리가 없는 것은 실수가 아니다 — 키는 전부 입력칸이 받는다(combobox 패턴).
 * 마우스는 `mousedown` 을 막아 입력칸에서 포커스가 빠져나가지 않게 한 뒤 `click` 으로 실행한다.
 */
function PaletteRow({ option, id, selected, index, onRun, onHover, isMac }: PaletteRowProps) {
  return (
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events -- combobox + listbox 패턴에서 키 처리는 입력칸 한 곳이다(스펙 §5). 항목에 키 처리기를 달면 포커스가 항목으로 내려가야 하고, 그러면 한글을 계속 칠 수 없다.
    <div
      id={id}
      role="option"
      aria-selected={selected}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onRun(option)}
      onMouseMove={() => onHover(index)}
      className={cn(
        'flex cursor-pointer items-center gap-[var(--space-2)] px-[var(--space-3)] py-[var(--space-2)]',
        'rounded-[var(--radius-md)] text-base text-text',
        // **선택은 앱의 다른 곳과 같은 말로 한다**: 날짜 스트립의 선택 셀이 `bg-accent text-on-accent`
        // 다(date-strip `DateCell`). 이전의 `bg-surface-2` 는 패널 배경 대비 1.11:1 이라 "선택" 이
        // 아니라 "거의 안 보이는 회색" 이었고, 같은 회색을 쓰는 `<kbd>` 칩이 선택된 행에서만
        // 배경에 녹아 사라졌다(대비 1.00:1 — 리뷰 Major 4 실측).
        //
        // 자손 규칙 둘: 선택 행 안의 모든 글자는 행의 전경색을 물려받고(`text-muted` 였던 메타·구분
        // 기호 포함), `<kbd>` 는 전경색을 옅게 깐 배경으로 한 단계 눌러 강조색 위에서도 알약으로 읽힌다.
        selected
          ? 'bg-accent text-on-accent [&_kbd]:border-on-accent/35 [&_kbd]:bg-on-accent/15 [&_span]:text-inherit'
          : 'hover:bg-surface-2',
      )}
    >
      <PaletteRowBody option={option} selected={selected} />
      {option.kind === 'command' && option.shortcutId !== undefined ? (
        <ShortcutKeys chords={chordsOf(option.shortcutId)} isMac={isMac} className="shrink-0" />
      ) : null}
    </div>
  );
}

/**
 * 줄의 본문. 투두는 "제목 + 카테고리 · 날짜".
 *
 * **좁은 화면에서는 메타가 제목 아래로 내려간다.** 한 줄에 붙여 두면 400px 에서 메타가 자리를 먹어
 * 제목이 절반쯤 잘렸다(리뷰 Minor). 예전 주석은 "제목 아래(좁은 화면) 또는 오른쪽" 이라고 적어 놓고
 * 구현은 언제나 한 줄이었다 — 주석이 거짓이었고, 이제 구현이 그 말대로 한다.
 */
function PaletteRowBody({ option, selected }: { option: PaletteOption; selected: boolean }) {
  if (option.kind !== 'todo') {
    return <span className="min-w-0 flex-1 truncate">{option.label}</span>;
  }
  return (
    <span className="flex min-w-0 flex-1 items-baseline gap-[var(--space-2)]">
      <span aria-hidden="true" className={cn('shrink-0', !selected && 'text-muted')}>
        {option.todo.done ? '◉' : '○'}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0 sm:flex-row sm:items-baseline sm:gap-[var(--space-2)]">
        <span
          className={cn(
            'min-w-0 truncate',
            option.todo.done && 'line-through',
            option.todo.done && !selected && 'text-muted',
          )}
        >
          {option.todo.title}
        </span>
        <span className={cn('shrink-0 truncate text-xs', !selected && 'text-muted')}>
          {option.meta}
        </span>
      </span>
      {option.todo.done ? <span className="sr-only">완료됨</span> : null}
    </span>
  );
}
