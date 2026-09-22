'use client';

// 메인 컬럼 — **<1024(narrow·compact)의 1열 경로 전용**(calendar-layout.md R8: "지금 구조 그대로").
// ≥1024(wide·mid)에서는 `ShellDayPanel` 이 `main` 을 맡고 이 컴포넌트는 아예 마운트되지 않는다
// (app-shell.md §2-A · §2-C 네 상태 · R1 `main` · R3 고정 영역 + 목록만 스크롤).
//
// 목록·다이어리·빈 상태의 실제 렌더링(`DayPanelBody`)은 `ShellDayPanel.tsx` 가 갖고 있고 여기서는
// 가져다 쓸 뿐이다 — 두 갈래가 각자 그 본문을 그리면 한쪽만 고쳐지는 순간 다른 쪽에서 조용히
// 되살아난다(calendar-layout.md R21).
import type { ReactNode } from 'react';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';

import { useCommandStore } from '@/features/command';
import { DayPanelBody, SKELETON_DELAY_MS } from '@/features/shell/components/ShellDayPanel';
import { useDelayedFlag } from '@/features/shell/hooks/useDelayedFlag';
import { SHELL_MAIN_ID } from '@/features/shell/lib/main-id';

import { Button } from '@/components/ui/Button';

/**
 * **단일 소스는 `lib/main-id.ts`** 다(리뷰 Nit). 여기서 재수출하는 이유: `SkipLink.tsx`(이 단위의
 * owns 밖)가 이 이름으로 import 하고 있어, 여기서 걷으면 그 배선이 끊긴다.
 */
export { SHELL_MAIN_ID };
/** 하단 고정 막대. 토스트가 이 위로 비켜 가야 해서 밖에서 찾을 수 있는 표식을 단다(R8). */
export const BOTTOM_BAR_ATTR = 'data-shell-bottom-bar';

type ShellMainProps = {
  date: DateKey;
  categories: readonly Category[];
  /** 카테고리 첫 조회가 아직 끝나지 않았다 — 목록도 빈 상태도 아직 정할 수 없다. */
  categoriesPending: boolean;
  /** 이 날짜의 투두를 **한 번도** 못 읽었다. 날짜를 옮길 때마다 스켈레톤이 번쩍이지 않게 좁힌 조건이다. */
  todosFirstLoading: boolean;
  /** 저장소를 열지 못했을 때 메인 전체를 대신할 카드 (§2-C 에러). */
  failureCard: ReactNode;
  /** 그날 투두가 0개인가 (§2-C 두 번째 빈 상태). */
  todosEmpty: boolean;
  header: ReactNode;
  onCreateCategory: () => void;
  /** 768px 미만의 하단 고정 `[+ 할 일]` (§2-B). */
  showBottomAdd: boolean;
};

/**
 * 하단 고정 버튼은 **첫 활성 그룹의 입력 행을 연다** (§2-B).
 *
 * 그 행을 여는 상태는 `TodoList` 안에 있다. DOM 에서 `+ 할 일 추가` 버튼을 찾아 눌러 주는 방법도
 * 되지만 남의 feature 내부 문구·구조에 결합된다. 대신 **공개된 이음새**를 쓴다: `TodoList` 가
 * `useShortcut('todo.new', …)` 로 등록해 둔 핸들러를 단축키 레지스트리에서 꺼내 그대로 부른다
 * (shortcuts R1 — 기능은 조합이 아니라 id 로 붙는다). `N` 키를 누른 것과 완전히 같은 경로다.
 */
function useTodoNewHandler(): ((e: KeyboardEvent) => void) | undefined {
  // 구독한다 — `TodoList` 가 마운트하며 등록하는 시점에 버튼의 활성 여부가 따라와야 한다.
  return useCommandStore((state) => state.shortcuts.find((entry) => entry.id === 'todo.new')?.run);
}

export function ShellMain({
  date,
  categories,
  categoriesPending,
  todosFirstLoading,
  failureCard,
  todosEmpty,
  header,
  onCreateCategory,
  showBottomAdd,
}: ShellMainProps) {
  const noCategories = !categoriesPending && categories.length === 0;
  const runTodoNew = useTodoNewHandler();
  const todoAreaLive = failureCard === null && !categoriesPending && !noCategories;
  // `DayPanelBody` 안의 스켈레톤 표시 여부와 **같은 문턱**으로 다시 잰다(같은 훅·같은 입력이라
  // 갈릴 수 없다) — 첫 조회가 끝나기 전에는 하단 버튼도 누를 대상이 준비되지 않은 것으로 본다.
  const showTodoSkeleton = useDelayedFlag(todosFirstLoading, SKELETON_DELAY_MS);
  // 누를 대상이 없을 때는 비활성이다 — 눌러도 아무 일 없는 버튼을 화면의 유일한 버튼으로 두지 않는다.
  const canAddTodo = todoAreaLive && !showTodoSkeleton && runTodoNew !== undefined;

  return (
    <main
      id={SHELL_MAIN_ID}
      tabIndex={-1}
      className="flex min-h-0 min-w-0 flex-1 flex-col outline-none"
    >
      {/* R3: 고정 영역. 위쪽 여백은 셸 컨테이너의 `py` 가 이미 준다. */}
      <div className="mx-auto w-full max-w-[760px] shrink-0 px-[var(--space-4)]">
        {failureCard === null ? header : null}
      </div>

      <div className="mx-auto min-h-0 w-full max-w-[760px] flex-1 overflow-y-auto px-[var(--space-4)] py-[var(--space-3)]">
        <DayPanelBody
          date={date}
          categories={categories}
          categoriesPending={categoriesPending}
          todosFirstLoading={todosFirstLoading}
          failureCard={failureCard}
          todosEmpty={todosEmpty}
          onCreateCategory={onCreateCategory}
        />
      </div>

      {showBottomAdd && todoAreaLive ? (
        <div
          {...{ [BOTTOM_BAR_ATTR]: '' }}
          className="shrink-0 border-t border-border bg-bg px-[var(--space-4)] py-[var(--space-2)]"
        >
          <Button
            className="w-full"
            disabled={!canAddTodo}
            onClick={() => runTodoNew?.(new KeyboardEvent('keydown'))}
          >
            + 할 일
          </Button>
        </div>
      ) : null}
    </main>
  );
}
