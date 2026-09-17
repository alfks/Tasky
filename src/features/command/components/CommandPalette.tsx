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
  countResults,
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
import { activeQuickAdd } from '@/features/command/store/command-registry';
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

/** **답이 도착한** 질의와 그 결과. 지금 질의가 이것과 다르면 아직 답이 없는 것이다. */
type SettledSearch = { query: string; todos: readonly Todo[] };

/** 검색의 한 순간. `pending` 은 **지금 질의에 대한 답이 아직 없다**는 뜻이다. */
type TodoSearchState = { todos: readonly Todo[]; pending: boolean };

/**
 * 제목 부분 일치 검색(R9·R10). 실패하면 빈 배열 — 투두 섹션이 사라지고 명령만 남는다(§2 에러).
 *
 * **답이 오기 전의 결과는 직전 것을 그대로 둔다**(stale-while-revalidate). 비워 버리면 80ms 디바운스 +
 * 저장소 왕복 동안 화면이 "결과가 없어요" 로 갔다가 돌아온다 — 실측으로 106ms 에 그 문구가 떠서
 * 약 150ms 동안 **자기 질의에 "없다"는 답**을 보여 줬고 패널 높이가 435 → 150 → 435px 로 두 번 튀었다
 * (리뷰 Major 3). 글자를 더 친 질의의 결과는 대개 직전 결과의 부분집합이라, 남겨 두는 편이
 * "보이는 것이 곧 실행되는 것" 을 깨지 않는다.
 *
 * **`pending` 을 상태가 아니라 파생으로 두는 것이 핵심이다.** 효과에서 `setPending(true)` 를 하면
 * 새 질의의 **첫 렌더 한 프레임**이 "아직 pending 이 아닌 채" 지나가고, 그 한 프레임에 빈 결과
 * 문구가 그려진다(실측: 입력 14ms 시점 MutationObserver 표본에 `결과가 없어요`). 답이 도착한 질의를
 * 들고 있다가 지금 질의와 비교하면 첫 렌더부터 정확하다.
 *
 * 질의가 바뀌면 이전 요청의 응답은 버린다. 버리지 않으면 느린 응답 하나가 나중 질의의 결과를 덮는다.
 */
function useTodoSearch(query: string): TodoSearchState {
  const trimmed = query.trim();
  const [settled, setSettled] = useState<SettledSearch>({ query: '', todos: [] });
  useEffect(() => {
    if (trimmed === '') return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      getRepositories()
        .todos.search(trimmed, SEARCH_LIMIT)
        .then((found) => {
          if (alive) setSettled({ query: trimmed, todos: found });
        })
        .catch(() => {
          if (alive) setSettled({ query: trimmed, todos: [] });
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [trimmed]);

  if (trimmed === '') return { todos: [], pending: false };
  return { todos: settled.todos, pending: settled.query !== trimmed };
}

/**
 * 여는 요소가 **명령의 결과로 사라졌을 때** 돌아갈 곳(R11 · `Dialog` 의 `returnFocus`).
 *
 * 등록된 명령 9개 중 날짜 이동 5개가 이 경로다: 주를 옮기면 스트립의 셀 7개가 통째로 갈리고,
 * 셀이나 그 날짜의 투두 행에서 팔레트를 열었으면 돌아갈 요소가 없다. `Dialog` 는 그때
 * `returnFocus` 를 묻고, 주지 않으면 포커스가 `<body>` 로 떨어진다(리뷰 Major 1 실측 4경로).
 *
 * **고르는 순서와 이유.**
 * 1. 지금 선택된 날짜 칸. 날짜를 옮긴 직후라면 그 칸이 곧 "방금 일어난 일" 이고, 거기서 `Tab` 을
 *    이으면 화면 순서대로 내려간다.
 * 2. `<main>`. 랜드마크라 어떤 화면에도 있고 셸이 `tabIndex=-1` 을 달아 둔다.
 *
 * 남의 feature 의 마크업을 알고 있지만 **둘 다 공개 계약**이다 — `radio`/`aria-checked` 는
 * radiogroup 이 지켜야 하는 ARIA 이고 `main` 은 HTML 랜드마크다. `data-flip-id` 같은 사적인
 * 표식과 달리 바뀌면 접근성 자체가 깨지므로 조용히 어긋날 여지가 작다.
 */
function paletteReturnFocus(): HTMLElement | null {
  const selectedDay = document.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]');
  return selectedDay ?? document.querySelector<HTMLElement>('main');
}

export function CommandPalette() {
  usePaletteCommands();
  const closePalette = useCommandStore((state) => state.closePalette);
  const commands = useCommandStore((state) => state.commands);
  const recentIds = useCommandStore((state) => state.recentCommandIds);
  const quickAdds = useCommandStore((state) => state.quickAdds);
  const today = useDateStripStore((state) => state.today);
  const categoryNames = useCategoryNames();

  const inputRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const listId = `${baseId}-list`;
  const optionId = (index: number): string => `${baseId}-option-${index}`;

  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const { todos, pending } = useTodoSearch(query);

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
    // `when()` 은 렌더마다 다시 묻는다 — 카테고리가 방금 생겼는데 줄이 안 나오면 안 된다(§2).
    quickAdd: activeQuickAdd(quickAdds),
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

  // 응답 전에는 결과 수를 알리지 않는다 — "결과가 없어요" 를 먼저 읽어 버리면 화면과 같은 거짓말이다.
  const liveText = pending && options.length === 0 ? '' : resultCountText(countResults(sections));

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
      returnFocus={paletteReturnFocus}
      className="mt-[var(--space-4)] mb-auto max-h-[75vh] max-w-[560px] overflow-y-hidden p-[var(--space-2)] sm:mt-[15vh]"
    >
      <div className="-mt-[var(--control-hit-min)] flex flex-col">
        {/*
          `Dialog` 의 머리줄(✕)과 **같은 줄에** 입력칸을 올린다. 그냥 두면 ✕ 하나만 든 빈 띠가
          53px 생겨서 첫눈에 들어오는 것이 검색창이 아니라 닫기 버튼이 된다(리뷰 Minor).
          음수 여백과 오른쪽 안전 여백은 둘 다 `--control-hit-min`(= IconButton 크기)이라 토큰이
          바뀌면 함께 움직인다. ✕ 자체를 없애는 것은 `Dialog` 수정이라 이 티켓의 owns 밖이다.
        */}
        <div className="flex items-center gap-[var(--space-2)] pr-[var(--control-hit-min)]">
          <span aria-hidden="true" className="pl-[var(--space-2)] text-base text-muted">
            🔍
          </span>
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
            className="min-w-0 flex-1 rounded-[var(--radius-md)] bg-surface-2 px-[var(--space-3)] py-[var(--space-2)] text-base text-text outline-none placeholder:text-muted focus-visible:outline-2 focus-visible:outline-focus"
          />
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {liveText}
        </p>
        {options.length > 0 ? (
          <CommandPaletteList
            listId={listId}
            sections={sections}
            activeIndex={safeIndex}
            optionId={optionId}
            onRun={runOption}
            onHover={setActiveIndex}
            isMac={isMacPlatform()}
          />
        ) : null}
        {options.length === 0 && !pending ? (
          // 라이브 영역이 같은 뜻을 이미 읽는다 — 여기까지 읽히면 낭독기가 두 번 말한다(리뷰 Minor).
          <p
            aria-hidden="true"
            className="px-[var(--space-3)] py-[var(--space-4)] text-base text-muted"
          >
            결과가 없어요 — 다른 말로 찾아보거나 Esc 로 닫아요
          </p>
        ) : null}
        {/*
          빈 질의 첫 화면이 "팔레트로만 할 수 있는 일" 을 하나도 안 보여 준다는 지적(리뷰 Minor).
          지금 등록된 명령은 전부 이미 보이는 UI·단축키의 중복이고, 팔레트의 고유 가치인 투두 검색과
          날짜 질의는 **입력해야만** 나타난다. 그 한 줄을 여기서 알린다.
          `aria-hidden` 인 이유: 키 조작은 이미 `?` 도움말과 combobox 역할이 알려 준다.
        */}
        <p
          aria-hidden="true"
          className="border-t border-border px-[var(--space-3)] pt-[var(--space-2)] text-xs text-muted"
        >
          {query.trim() === ''
            ? '할 일 제목이나 날짜(9/18)를 입력해 찾아보세요'
            : '↑↓ 이동 · Enter 실행 · Esc 닫기'}
        </p>
      </div>
    </Dialog>
  );
}
