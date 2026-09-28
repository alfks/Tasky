'use client';

// 선택 날짜 패널 (app-shell.md §2-A · R1 `main` · calendar-layout.md §1-B R1(c)·R2·R5·R7·R21 ·
// §2-C 네 상태).
//
// ≥1024(`wide`·`mid`)에서 이 컴포넌트가 `main` 랜드마크를 맡는다(R1) — 건너뛰기 링크·포커스 복귀·
// e2e 의 `main` 조회가 가리키는 "할 일이 있는 곳"이 이제 여기다. <1024 에서는 `ShellMain` 이
// 대신 `main` 을 맡는데, 목록·다이어리·빈 상태 렌더링(`DayPanelBody`)은 **여기서만** 정의해
// `ShellMain` 이 가져다 쓴다 — 본문 로직이 두 벌로 갈리면 한쪽만 고쳐지는 순간 다른 쪽에서
// 조용히 되살아난다(§2-C 문구·스켈레톤 배선이 실제로 그렇게 갈렸던 전례).
import { useLayoutEffect, useRef } from 'react';
import type { MutableRefObject, ReactNode } from 'react';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';
import type { Todo } from '@/domain/todo/todo';

import { useDateStripStore } from '@/features/date-strip';
import { DiaryCard } from '@/features/diary';
import { useDelayedFlag } from '@/features/shell/hooks/useDelayedFlag';
import { SHELL_MAIN_ID } from '@/features/shell/lib/main-id';
import { titleDateLabel } from '@/features/shell/lib/title';
import { CompletionRing, completionPercentText, type CompletionSummary } from '@/features/stats';
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
 * 선택 날짜가 오늘인지 과거인지 미래인지에 따라 빈 상태 한 줄을 고른다 (R21 — 시제, date-strip R4).
 *
 * `today` 는 **날짜 스트립 스토어의 것**을 그대로 받는다 — 오늘 판정의 출처는 `lib/date.todayKey()`
 * 하나이고, 자정을 넘길 때 그 값을 갱신하는 곳도 거기뿐이다(R12). 여기서 시계를 다시 읽으면
 * 판정이 두 벌이 된다.
 *
 * DateKey 는 0 을 채운 'YYYY-MM-DD' 고정 폭이라 사전순 비교가 곧 날짜순 비교다.
 */
export function emptyTodosText(date: DateKey, today: DateKey): string {
  if (date === today) return EMPTY_TODOS_TEXT;
  return date > today ? EMPTY_TODOS_TEXT_FUTURE : EMPTY_TODOS_TEXT_PAST;
}
/** §2-C 로딩: 이 시간을 넘겨도 끝나지 않을 때만 스켈레톤을 그린다. */
export const SKELETON_DELAY_MS = 100;

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

export type DayPanelBodyProps = {
  date: DateKey;
  categories: readonly Category[];
  /** 카테고리 첫 조회가 아직 끝나지 않았다 — 목록도 빈 상태도 아직 정할 수 없다. */
  categoriesPending: boolean;
  /** 이 날짜의 투두를 **한 번도** 못 읽었다. 날짜를 옮길 때마다 스켈레톤이 번쩍이지 않게 좁힌 조건이다. */
  todosFirstLoading: boolean;
  /** 저장소를 열지 못했을 때 이 영역 전체를 대신할 카드 (§2-C 에러). */
  failureCard: ReactNode;
  /** 그날 투두가 0개인가 (§2-C 두 번째 빈 상태). */
  todosEmpty: boolean;
  onCreateCategory: () => void;
  /** 투두 항목 메뉴 "타이머 시작" (timer.md §2) — `TodoList` 로 그대로 흘려보낸다. */
  onStartTimer?: (todo: Todo) => void;
};

/**
 * 목록·다이어리·빈 상태 (§2-C) — **`ShellDayPanel`(≥1024)과 `ShellMain`(<1024)이 함께 쓰는 본문**.
 * 두 컴포넌트는 이 안쪽 내용을 감싸는 머리(패널 머리 대 전체 `ShellHeader`)와 스크롤 컨테이너만
 * 다르게 두른다 — R21 이 "옮겨 받는다"고 부르는 것이 정확히 이 함수다.
 */
export function DayPanelBody({
  date,
  categories,
  categoriesPending,
  todosFirstLoading,
  failureCard,
  todosEmpty,
  onCreateCategory,
  onStartTimer,
}: DayPanelBodyProps) {
  // 자정을 넘기면 스트립의 '오늘' 이 갱신되고(R12) 이 한 줄도 같은 박자로 따라간다.
  const today = useDateStripStore((state) => state.today);
  const showCategorySkeleton = useDelayedFlag(categoriesPending, SKELETON_DELAY_MS);
  const showTodoSkeleton = useDelayedFlag(todosFirstLoading, SKELETON_DELAY_MS);
  const noCategories = !categoriesPending && categories.length === 0;

  if (failureCard !== null) return <>{failureCard}</>;

  if (categoriesPending) return showCategorySkeleton ? <MainSkeleton /> : null;

  if (noCategories) {
    // 빈 상태 안내도 **상시 카드**다(app-shell.md §2-A). 화면에 카드가 이것 하나뿐인 순간이라
    // 오히려 여기서 면이 흐리면 앱이 아직 안 그려진 것처럼 보인다.
    return (
      <div className="flex flex-col items-start gap-[var(--space-3)] rounded-[var(--radius-xl)] border border-border bg-surface p-[var(--space-6)] shadow-sm">
        <p className="text-base text-text">{EMPTY_CATEGORIES_TEXT}</p>
        <Button onClick={onCreateCategory}>{EMPTY_CATEGORIES_CTA}</Button>
      </div>
    );
  }

  return (
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
          <p className="pb-[var(--space-2)] text-base text-muted">{emptyTodosText(date, today)}</p>
        ) : null}
        <TodoList date={date} categories={categories} onStartTimer={onStartTimer} />
      </div>
      {/* 다이어리 카드(diary.md §2 — 투두 목록 아래). 카테고리·투두와 무관한 독립 기록이다. */}
      <DiaryCard date={date} />
    </>
  );
}

type ShellDayPanelProps = DayPanelBodyProps & {
  summary: CompletionSummary;
  scrollPositionRef?: MutableRefObject<number>;
};

/**
 * ≥1024 의 `main` (calendar-layout.md R1(c)·R5). 머리 한 줄만 고정, 목록·다이어리가 스크롤한다(R3).
 */
export function ShellDayPanel({ date, summary, scrollPositionRef, ...body }: ShellDayPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = scrollRef.current;
    if (element && scrollPositionRef) element.scrollTop = scrollPositionRef.current;
    return () => {
      if (element && scrollPositionRef) scrollPositionRef.current = element.scrollTop;
    };
  }, [scrollPositionRef]);
  return (
    <main
      id={SHELL_MAIN_ID}
      tabIndex={-1}
      className="flex min-h-0 w-[400px] shrink-0 flex-col outline-none"
    >
      {/* R5: `M월 D일 (요일)` + 달성률 `◯ n%`(링 20px) 한 줄, 고정. */}
      <div className="flex shrink-0 items-center gap-[var(--space-2)] px-[var(--space-4)] pb-[var(--space-2)]">
        <p className="text-base font-semibold text-text">{titleDateLabel(date)}</p>
        <div className="flex-1" />
        <span className="flex items-center gap-[var(--space-1)]">
          <CompletionRing summary={summary} size={20} thickness={3} />
          <span aria-hidden="true" className="text-base font-semibold text-text tabular-nums">
            {completionPercentText(summary)}
          </span>
        </span>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-[var(--space-4)] py-[var(--space-3)]"
      >
        <DayPanelBody date={date} {...body} />
      </div>
    </main>
  );
}
