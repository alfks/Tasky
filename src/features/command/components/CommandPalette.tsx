/**
 * 커맨드 팔레트(shortcuts §2 · §3-B · §5). `Mod+K` 로 열리고, 명령과 투두를 한 목록에서 고른다.
 *
 * 화면 밖의 것은 전부 옆 파일이다: 목록의 규칙은 `CommandPaletteOptions`, 실행의 부수효과는
 * `CommandPaletteRun`, MVP 명령 목록은 `CommandPaletteCommands`. 여기 남은 것은 **대화상자·
 * 입력칸·키 처리** 셋뿐이다.
 *
 * 오버레이의 공통 규칙(포커스 트랩·Esc·바깥 클릭·배경 inert·포커스 복귀·Enter/IME)은 `Dialog` 가
 * 이미 지킨다 — 팔레트가 다시 구현하지 않는다. 특히 **닫으면 열기 전 포커스로 돌아가는 것**(R11)이
 * `Dialog` 의 책임이라, 실행은 "닫고 나서" 일어나야 순서가 맞는다(`CommandPaletteRun` 참조).
 */
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';

import type { Todo } from '@/domain/todo/todo';

import { getRepositories } from '@/repositories/container';

import { usePaletteCommands } from '@/features/command/components/CommandPaletteCommands';
import { CommandPaletteList } from '@/features/command/components/CommandPaletteList';
import {
  buildSections,
  clampIndex,
  flattenOptions,
  formatMonthDay,
  parseDateQuery,
  resultCountText,
  stepIndex,
  type CommandOption,
  type PaletteOption,
} from '@/features/command/components/CommandPaletteOptions';
import { goToTodo } from '@/features/command/components/CommandPaletteRun';
import { isMacPlatform } from '@/features/command/lib/key-label';
import { useCommandStore } from '@/features/command/store/command-store';
import { useDateStripStore } from '@/features/date-strip';

import { Dialog } from '@/components/ui/Dialog';

import { isImeKey } from '@/lib/ime';

/**
 * 투두 줄에 붙일 카테고리 이름. **`@/features/category` 를 쓰지 않고 저장소에서 읽는다** —
 * `category → todo → command` 가 import 순환이라 런타임 초기화가 깨진다
 * (`CommandPaletteCommands.tsx` 의 표 참조). 팔레트가 열려 있는 짧은 동안만 쓰는 읽기 전용
 * 사본이라 스토어를 구독할 이유도 없다.
 */
function useCategoryNames(): ReadonlyMap<string, string> {
  const [names, setNames] = useState<ReadonlyMap<string, string>>(new Map());
  useEffect(() => {
    let alive = true;
    getRepositories()
      .categories.list({ includeClosed: true })
      .then((categories) => {
        if (alive) setNames(new Map(categories.map((category) => [category.id, category.name])));
      })
      .catch(() => {
        // 이름을 못 읽어도 투두 검색은 살아 있어야 한다 — "카테고리 없음" 으로 그린다.
      });
    return () => {
      alive = false;
    };
  }, []);
  return names;
}

/** R9 상한. */
const SEARCH_LIMIT = 20;
/** R10 의 디바운스. 스피너는 없다(§2). */
const SEARCH_DEBOUNCE_MS = 80;

/**
 * 제목 부분 일치 검색(R9·R10). 실패하면 빈 배열 — 투두 섹션이 사라지고 명령만 남는다(§2 에러).
 *
 * 질의가 바뀌면 이전 요청의 응답은 버린다. 버리지 않으면 느린 응답 하나가 나중 질의의 결과를 덮는다.
 */
function useTodoSearch(query: string): readonly Todo[] {
  const [todos, setTodos] = useState<readonly Todo[]>([]);
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === '') {
      setTodos([]);
      return undefined;
    }
    let alive = true;
    const timer = setTimeout(() => {
      getRepositories()
        .todos.search(trimmed, SEARCH_LIMIT)
        .then((found) => {
          if (alive) setTodos(found);
        })
        .catch(() => {
          if (alive) setTodos([]);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [query]);
  return todos;
}

export function CommandPalette() {
  usePaletteCommands();
  const closePalette = useCommandStore((state) => state.closePalette);
  const commands = useCommandStore((state) => state.commands);
  const recentIds = useCommandStore((state) => state.recentCommandIds);
  const today = useDateStripStore((state) => state.today);
  const categoryNames = useCategoryNames();

  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number): string => `${baseId}-option-${index}`;

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const todos = useTodoSearch(query);

  const jumpDate = parseDateQuery(query, today);
  const dateJump: CommandOption | null =
    jumpDate === null
      ? null
      : {
          kind: 'command',
          key: `date-jump:${jumpDate}`,
          label: `${formatMonthDay(jumpDate)}로 이동`,
          run: () => useDateStripStore.getState().select(jumpDate),
        };

  const sections = buildSections({
    commands,
    recentIds,
    query,
    dateJump,
    todos,
    categoryNames,
  });
  const options = flattenOptions(sections);
  const safeIndex = clampIndex(activeIndex, options.length);

  // 질의가 바뀌면 선택은 맨 위로. 목록이 통째로 달라졌는데 세 번째 줄이 선택돼 있으면 놀란다.
  useEffect(() => setActiveIndex(0), [query]);

  // jsdom 에는 `scrollIntoView` 가 없다 — 있을 때만 부른다.
  useEffect(() => {
    document.getElementById(optionId(safeIndex))?.scrollIntoView?.({ block: 'nearest' });
    // optionId 는 렌더마다 새 함수지만 baseId 가 같으면 같은 문자열을 만든다.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- baseId·safeIndex 가 실제 의존성이다.
  }, [baseId, safeIndex]);

  const runOption = (option: PaletteOption): void => {
    if (option.kind === 'todo') {
      closePalette();
      void goToTodo(option.todo);
      return;
    }
    // 명령은 **닫기 전에** 집는다. 등록이 팔레트의 수명에 묶여 있어서(`usePaletteCommands`),
    // 언마운트가 먼저 커밋되면 `runCommand` 가 빈손이 될 여지가 있다. 순서를 뒤집어도 지금
    // React 19 에서는 통과한다(jsdom·Chromium 양쪽 실측) — 그래서 이 순서는 **보험**이지
    // 재현된 버그의 수정이 아니다. 명령 등록이 팔레트 밖으로 옮겨 가면 순서는 무의미해진다.
    if (option.commandId !== undefined)
      void useCommandStore.getState().runCommand(option.commandId);
    else void option.run?.();
    closePalette();
  };

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>): void => {
    // 한글 조합 중의 Enter·화살표는 조합기의 것이다 — 여기서 확정으로 읽으면 "ㅇ" 만 치고 실행된다.
    if (isImeKey(e.nativeEvent)) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(stepIndex(safeIndex, e.key === 'ArrowDown' ? 1 : -1, options.length));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const option = options[safeIndex];
      if (option !== undefined) runOption(option);
    }
  };

  return (
    <Dialog
      open
      onClose={closePalette}
      title={<span className="sr-only">명령 팔레트</span>}
      closeLabel="팔레트 닫기"
      initialFocusRef={inputRef}
      className="mt-[var(--space-4)] mb-auto max-h-[75vh] max-w-[560px] overflow-y-hidden p-[var(--space-2)] sm:mt-[15vh]"
    >
      <div className="flex flex-col">
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="할 일 검색 또는 명령"
          aria-expanded={options.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={options.length > 0 ? optionId(safeIndex) : undefined}
          placeholder="할 일 검색 또는 명령…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          className="w-full rounded-[var(--radius-md)] bg-surface-2 px-[var(--space-3)] py-[var(--space-2)] text-base text-text outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-focus"
        />
        <p role="status" aria-live="polite" className="sr-only">
          {resultCountText(options.length)}
        </p>
        {options.length === 0 ? (
          <p className="px-[var(--space-3)] py-[var(--space-4)] text-base text-muted">
            결과가 없어요
          </p>
        ) : (
          <CommandPaletteList
            listId={listId}
            sections={sections}
            activeIndex={safeIndex}
            optionId={optionId}
            onRun={runOption}
            onHover={setActiveIndex}
            isMac={isMacPlatform()}
          />
        )}
      </div>
    </Dialog>
  );
}
