/**
 * 팔레트에서 고른 것을 **실제로 실행**하는 부수효과들(shortcuts §2 · R9·R11).
 *
 * 화면 파일에서 떼어 놓은 이유: 여기 있는 것은 전부 "닫힌 뒤에 일어나는 일"(날짜 이동 → 목록이
 * 다시 그려지기를 기다렸다가 → 그 행에 포커스)이라, 대화상자가 살아 있는 동안의 렌더 규칙과
 * 수명이 다르다. 섞어 두면 팔레트가 언마운트된 뒤에도 도는 타이머가 컴포넌트 상태를 건드린다.
 *
 * 확장자가 `.tsx` 인데 JSX 가 없는 이유는 `CommandPaletteOptions.tsx` 와 같다(`owns` 제약).
 */
import type { Todo } from '@/domain/todo/todo';

import { useDateStripStore } from '@/features/date-strip';

/**
 * 투두 행을 찾는 표식. **남의 feature 의 DOM 계약이다** — `src/features/todo/components/todo-focus.ts`
 * 의 `FLIP_ATTR` 과 같은 값인데, 그 파일은 `@/features/todo` 배럴에 없어 import 할 수 없다
 * (feature 간 import 는 배럴만 — `src/features/AGENTS.md` 규칙 2). 배럴이 `FLIP_ATTR` 을 내보내면
 * 이 상수를 지운다. 그 전까지는 값이 갈리면 **포커스만 조용히 안 간다**(날짜 이동은 그대로 된다).
 */
export const TODO_ROW_ATTR = 'data-flip-id';

/** 고른 투두를 알아보게 두는 시간(§2 "하이라이트 400ms"). */
export const TODO_HIGHLIGHT_MS = 400;

/** 목록이 다시 그려지기를 기다리는 한도. 넘으면 포커스를 포기한다(날짜는 이미 옮겨 갔다). */
const WAIT_LIMIT_MS = 1500;
const POLL_MS = 50;

/** 지금 화면에 있는 그 투두의 행. */
function findTodoRow(todoId: string): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  return document.querySelector<HTMLElement>(`[${TODO_ROW_ATTR}="${CSS.escape(todoId)}"]`);
}

/**
 * 조건이 참이 될 때까지 짧게 기다린다. 참이면 `true`, 한도를 넘기면 `false`.
 * `setInterval` 인 이유: 기다리는 대상이 스토어(상태)와 DOM(렌더 결과) 둘이라 구독 하나로는 부족하다.
 */
function waitFor(predicate: () => boolean, limitMs = WAIT_LIMIT_MS): Promise<boolean> {
  if (predicate()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let waited = 0;
    const timer = setInterval(() => {
      waited += POLL_MS;
      if (predicate()) {
        clearInterval(timer);
        resolve(true);
        return;
      }
      if (waited >= limitMs) {
        clearInterval(timer);
        resolve(false);
      }
    }, POLL_MS);
  });
}

/**
 * 그 행에 포커스를 주고 400ms 동안 눈에 띄게 둔다(§2).
 *
 * 윤곽선을 클래스가 아니라 인라인 스타일로 거는 이유: 클릭으로 골랐을 때는 `:focus-visible` 이
 * 걸리지 않아 포커스 링이 보이지 않는다 — 그러면 "어디로 갔는지" 를 알려 주는 표시가 사라진다.
 */
export function highlightRow(row: HTMLElement): void {
  row.focus();
  row.style.outline = '2px solid var(--color-focus)';
  row.style.outlineOffset = '2px';
  setTimeout(() => {
    row.style.outline = '';
    row.style.outlineOffset = '';
  }, TODO_HIGHLIGHT_MS);
}

/** 그 투두의 날짜로 옮기고, 목록에 행이 나타나면 포커스한다(§2). 행을 못 찾아도 날짜는 옮겨져 있다. */
export async function goToTodo(todo: Todo): Promise<void> {
  useDateStripStore.getState().select(todo.date);
  const found = await waitFor(() => findTodoRow(todo.id) !== null);
  if (!found) return;
  const row = findTodoRow(todo.id);
  if (row !== null) highlightRow(row);
}

/**
 * ## "결과가 없어요 — Enter로 '장보기'를 오늘 할 일로 추가"(§2 빈 결과)는 **여기 없다**
 *
 * 그 줄은 투두를 만들어야 하고, 만들려면 `@/features/todo` 의 스토어가 필요하다. 그런데
 * `TodoList` 가 단축키 때문에 `@/features/command` 를 import 하고 있어서, 반대 방향을 더하면
 * feature 두 개가 서로를 부르는 순환이 된다(`import/no-cycle` 이 막는다 — 실측).
 *
 * 그래서 R7 과 같은 방향으로 풀었다(T-53): 투두 feature 가 `registerQuickAdd` 로 **그 줄 하나를**
 * 레지스트리에 걸고(`todo/hooks/useTodoCommands.ts`), 팔레트는 결과가 하나도 없을 때 그것을
 * 목록의 한 항목으로 그린다(`CommandPaletteOptions.quickAddOption`). 화살표는 여전히
 * `todo → command` 한 방향이다.
 *
 * 실행이 이 파일이 아니라 등록 쪽에 있는 이유: "오늘로 옮기고 → 그 날짜가 올라오기를 기다렸다가 →
 * 첫 카테고리에 추가" 는 투두 스토어의 적재 규칙(R17)을 알아야 하는 일이다. 여기서 하면 팔레트가
 * 남의 스토어의 수명을 흉내 내게 된다.
 */
