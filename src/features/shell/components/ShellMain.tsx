'use client';

// 메인 컬럼 — **<1024(narrow·compact)의 1열 경로 전용**(calendar-layout.md R8: "지금 구조 그대로").
// ≥1024(wide·mid)에서는 `ShellDayPanel` 이 `main` 을 맡고 이 컴포넌트는 아예 마운트되지 않는다
// (app-shell.md §2-A · §2-C 네 상태 · R1 `main` · R3 고정 영역 + 목록만 스크롤).
//
// 목록·다이어리·빈 상태의 실제 렌더링(`DayPanelBody`)은 `ShellDayPanel.tsx` 가 갖고 있고 여기서는
// 가져다 쓸 뿐이다 — 두 갈래가 각자 그 본문을 그리면 한쪽만 고쳐지는 순간 다른 쪽에서 조용히
// 되살아난다(calendar-layout.md R21).
import { useRef } from 'react';
import type { ReactNode } from 'react';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';

import { useCommandStore } from '@/features/command';
import { DayPanelBody, SKELETON_DELAY_MS } from '@/features/shell/components/ShellDayPanel';
import { useBottomBarOffset } from '@/features/shell/hooks/useBottomBarOffset';
import { useDelayedFlag } from '@/features/shell/hooks/useDelayedFlag';
import { useGuardAmbiguousClip } from '@/features/shell/hooks/useGuardAmbiguousClip';
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
  // 하단 막대가 목록 스크롤 영역의 마지막 줄을 가리지 않게, 그 막대의 **실측** 높이만큼
  // padding-bottom 을 더 준다(리뷰 Major — 실측 재현: 360px·카테고리 2개·할 일 9개·배너 닫음에서
  // 마지막 행 체크박스 중심이 `elementFromPoint` 로 막대에 잡혔다. flex 배치 자체는 막대와 스크롤
  // 영역을 정확히 나누지만, 그 경계까지 목록을 다 내려도 마지막 줄이 경계에 딱 붙어 있어 막대가
  // 시작되는 자리와 구분이 안 됐다 — 이 여지가 그 틈을 준다). 막대가 없으면(≥768) 0이라 변화 없다.
  const bottomBarOffset = useBottomBarOffset();
  // 손대지 않은 첫 화면에서 마지막 행이 "거의 다 보이는데 살짝만 잘린" 애매한 상태로 뜨는 것을
  // 막는다 — padding-bottom(위)은 스크롤 **끝**에만 여지를 주므로 이 경우는 못 잡는다
  // (`lib/scroll-clip-guard.ts` 머리주석에 전체 인과가 있다). `showBottomAdd` 일 때만 건다 — 막대가
  // 없는 화면(≥768)은 이 애매함이 생길 자리 자체가 없다.
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  useGuardAmbiguousClip(scrollAreaRef, showBottomAdd);

  return (
    <main
      id={SHELL_MAIN_ID}
      tabIndex={-1}
      className="flex min-h-0 min-w-0 flex-1 flex-col outline-none"
    >
      {/* R3: 고정 영역. 위쪽 여백은 셸 컨테이너의 `py` 가 이미 준다. */}
      {/*
        max-w: 768~1023(narrow)은 이 컴포넌트가 그대로 그리는 유일한 폭 구간이다(<768 은 화면 자체가
        좁아 760이 걸리지 않는다). 760 그대로 두면 목록 한 줄(예: "○ 장보기 ⏱25분 ⋯")이 채 절반도
        못 채우는 폭에 가운데 정렬만 되어, 카드 오른쪽에 큰 빈 여백이 남는다 — 사용자가 애초에
        불평한 "오른쪽이 빈다"가 1열 구간에서 그대로 재현된 것(리뷰 Major, 900·1023px 실측).
        `md:`(Tailwind 기본 768px, `SHELL_BREAKPOINTS.narrow` 와 값이 같다 — calendar-layout.md R13과
        같은 방식)로 768 이상에서만 **달력 컬럼의 위쪽 한계**(calendar-layout.md R2, 440~560)와 같은
        560으로 좁힌다 — 3영역의 가운데 정렬과 같은 언어를 쓰라는 지침(calendar-layout.md §1-C
        인접 절)을 따른 것이다. compact(<768)는 `md:` 가 걸리지 않아 지금과 같다(calendar-layout.md
        R8 "지금 구조 그대로").
      */}
      <div className="mx-auto w-full max-w-[760px] shrink-0 px-[var(--space-4)] md:max-w-[560px]">
        {failureCard === null ? header : null}
      </div>

      <div
        ref={scrollAreaRef}
        className="mx-auto min-h-0 w-full max-w-[760px] flex-1 overflow-y-auto px-[var(--space-4)] pt-[var(--space-3)] md:max-w-[560px]"
        style={{ paddingBottom: `calc(var(--space-3) + ${bottomBarOffset}px)` }}
      >
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
          className="shrink-0 border-t border-border bg-bg px-[var(--space-4)] pt-[var(--space-2)] pb-[calc(var(--space-2)+env(safe-area-inset-bottom))]"
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
