'use client';

// 메인 컬럼 (app-shell.md §2-A · §2-C 네 상태 · R1 `main` · R3 고정 영역 + 목록만 스크롤).
import type { ReactNode } from 'react';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';

import { useCommandStore } from '@/features/command';
import { useDateStripStore } from '@/features/date-strip';
import { useDelayedFlag } from '@/features/shell/hooks/useDelayedFlag';
import { TodoList } from '@/features/todo';

import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

/** §2-C 문구. 테스트가 스펙과 1:1 로 대조한다. */
export const EMPTY_CATEGORIES_TEXT = '카테고리를 만들면 할 일을 적을 수 있어요';
export const EMPTY_CATEGORIES_CTA = '첫 카테고리 만들기';
/** 선택 날짜가 **오늘**일 때의 §2-C 문구. 스펙에 적힌 문장 그대로다. */
export const EMPTY_TODOS_TEXT = '오늘은 비어 있어요. 하나 적어 볼까요?';
/** 아직 오지 않은 날. 지금 하자고 부르지 않고 미리 적어 두자고 권한다. */
export const EMPTY_TODOS_TEXT_FUTURE = '이날은 아직 비어 있어요. 미리 적어 둘까요?';
/**
 * 이미 지난 날. "하나 적어 볼까요?" 는 지나간 날엔 재촉으로 읽히고, 그날 아무것도 안 한 사람을
 * 나무라는 말이 된다. 그래서 과거형으로 사실만 말하고, 뒤늦게 적는 것도 괜찮다고만 덧붙인다
 * (지난 날짜에도 투두는 그대로 추가된다 — 길을 막지는 않는다).
 */
export const EMPTY_TODOS_TEXT_PAST = '이날은 비어 있었어요. 지금 적어 둬도 괜찮아요.';

/**
 * 선택 날짜가 오늘인지 과거인지 미래인지에 따라 빈 상태 한 줄을 고른다.
 *
 * 날짜를 옮겨 다니는 것이 이 앱의 핵심 동작이라(date-strip R4), "오늘은" 을 어느 날짜에나
 * 쓰면 화면이 거짓말을 한다. `today` 는 **날짜 스트립 스토어의 것**을 그대로 받는다 —
 * 오늘 판정의 출처는 `lib/date.todayKey()` 하나이고, 자정을 넘길 때 그 값을 갱신하는 곳도
 * 거기뿐이다(R12). 여기서 시계를 다시 읽으면 판정이 두 벌이 된다.
 *
 * DateKey 는 0 을 채운 'YYYY-MM-DD' 고정 폭이라 사전순 비교가 곧 날짜순 비교다.
 */
export function emptyTodosText(date: DateKey, today: DateKey): string {
  if (date === today) return EMPTY_TODOS_TEXT;
  return date > today ? EMPTY_TODOS_TEXT_FUTURE : EMPTY_TODOS_TEXT_PAST;
}
/** §2-C 로딩: 이 시간을 넘겨도 끝나지 않을 때만 스켈레톤을 그린다. */
export const SKELETON_DELAY_MS = 100;

export const SHELL_MAIN_ID = 'shell-main';
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

/** 그룹 헤더 1 + 행 3 (§2-C 로딩). */
function MainSkeleton() {
  return (
    <div aria-busy="true" className="flex flex-col gap-[var(--space-2)]">
      <Skeleton className="h-[var(--space-6)] w-[8rem]" />
      <Skeleton className="h-[var(--control-height)]" />
      <Skeleton className="h-[var(--control-height)]" />
      <Skeleton className="h-[var(--control-height)]" />
    </div>
  );
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
  // 자정을 넘기면 스트립의 '오늘' 이 갱신되고(R12) 이 한 줄도 같은 박자로 따라간다.
  const today = useDateStripStore((state) => state.today);
  const showCategorySkeleton = useDelayedFlag(categoriesPending, SKELETON_DELAY_MS);
  const showTodoSkeleton = useDelayedFlag(todosFirstLoading, SKELETON_DELAY_MS);
  const noCategories = !categoriesPending && categories.length === 0;
  const runTodoNew = useTodoNewHandler();
  const todoAreaLive = failureCard === null && !categoriesPending && !noCategories;
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
        {failureCard !== null ? (
          failureCard
        ) : categoriesPending ? (
          showCategorySkeleton ? (
            <MainSkeleton />
          ) : null
        ) : noCategories ? (
          <div className="flex flex-col items-start gap-[var(--space-3)] rounded-[var(--radius-xl)] bg-surface p-[var(--space-6)]">
            <p className="text-base text-text">{EMPTY_CATEGORIES_TEXT}</p>
            <Button onClick={onCreateCategory}>{EMPTY_CATEGORIES_CTA}</Button>
          </div>
        ) : (
          <>
            {showTodoSkeleton ? <MainSkeleton /> : null}
            {/*
              **`TodoList` 를 스켈레톤으로 갈아 끼우지 않는다.** 그 컴포넌트가 선택 날짜를 메모리에
              올리는 주체라(todo R17), 스켈레톤이 자리를 대신하면 언마운트 → 적재 취소 → 다시 마운트
              → 또 적재로 진동한다(리뷰 실측: 조작 0회에 `listByDate` 8회). 그래서 **항상 마운트한
              채** 숨기기만 한다. 화면에 한 번만 마운트한다는 규약도 그대로다.
            */}
            <div hidden={showTodoSkeleton}>
              {todosEmpty ? (
                <p className="pb-[var(--space-2)] text-base text-muted">
                  {emptyTodosText(date, today)}
                </p>
              ) : null}
              <TodoList date={date} categories={categories} />
            </div>
          </>
        )}
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
