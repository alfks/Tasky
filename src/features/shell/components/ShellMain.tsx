'use client';

// 메인 컬럼 (app-shell.md §2-A · §2-C 네 상태 · R1 `main` · R3 고정 영역 + 목록만 스크롤).
import type { ReactNode } from 'react';

import type { Category } from '@/domain/category/category';
import type { DateKey } from '@/domain/date/date-key';

import { useDelayedFlag } from '@/features/shell/hooks/useDelayedFlag';
import { TODO_MESSAGES, TodoList } from '@/features/todo';

import { Button } from '@/components/ui/Button';
import { Skeleton } from '@/components/ui/Skeleton';

/** §2-C 문구. 테스트가 스펙과 1:1 로 대조한다. */
export const EMPTY_CATEGORIES_TEXT = '카테고리를 만들면 할 일을 적을 수 있어요';
export const EMPTY_CATEGORIES_CTA = '첫 카테고리 만들기';
export const EMPTY_TODOS_TEXT = '오늘은 비어 있어요. 하나 적어 볼까요?';
/** §2-C 로딩: 이 시간을 넘겨도 끝나지 않을 때만 스켈레톤을 그린다. */
export const SKELETON_DELAY_MS = 100;

export const SHELL_MAIN_ID = 'shell-main';

type ShellMainProps = {
  date: DateKey;
  categories: readonly Category[];
  /** 저장소·카테고리·투두 중 하나라도 첫 조회 중인가. */
  loading: boolean;
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
 * 하단 고정 버튼은 **첫 활성 그룹의 입력 행을 연다** (§2-B). 그 행을 여는 상태는 `TodoList` 안에 있고
 * 그 파일은 이 티켓의 `owns` 밖이라, 화면에 이미 있는 `+ 할 일 추가` 버튼을 눌러 준다 — 사용자가
 * 직접 누른 것과 **같은 경로**라 포커스·검증·IME 처리가 전부 그대로다.
 */
function openFirstAddRow(): void {
  const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('main button'));
  const target = buttons.find((button) => button.textContent?.trim() === TODO_MESSAGES.addButton);
  target?.scrollIntoView({ block: 'nearest' });
  target?.click();
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
  loading,
  failureCard,
  todosEmpty,
  header,
  onCreateCategory,
  showBottomAdd,
}: ShellMainProps) {
  const showSkeleton = useDelayedFlag(loading, SKELETON_DELAY_MS);
  const noCategories = !loading && categories.length === 0;

  return (
    <main
      id={SHELL_MAIN_ID}
      tabIndex={-1}
      className="flex min-h-0 min-w-0 flex-1 flex-col outline-none"
    >
      {/*
        R3: 고정 영역 — 1280×800 에서 **160px** 이다(실측). 위쪽 여백은 셸 컨테이너의 `py` 가 이미
        주므로 여기서 다시 주지 않는다. 한 줄만 더 넣어도 상한을 넘는다.
      */}
      <div className="mx-auto w-full max-w-[760px] shrink-0 px-[var(--space-4)]">
        {failureCard === null ? header : null}
      </div>

      <div className="mx-auto min-h-0 w-full max-w-[760px] flex-1 overflow-y-auto px-[var(--space-4)] py-[var(--space-3)]">
        {failureCard !== null ? (
          failureCard
        ) : showSkeleton ? (
          <MainSkeleton />
        ) : noCategories ? (
          <div className="flex flex-col items-start gap-[var(--space-3)] rounded-[var(--radius-xl)] bg-surface p-[var(--space-6)]">
            <p className="text-base text-text">{EMPTY_CATEGORIES_TEXT}</p>
            <Button onClick={onCreateCategory}>{EMPTY_CATEGORIES_CTA}</Button>
          </div>
        ) : (
          <>
            {todosEmpty ? (
              <p className="pb-[var(--space-2)] text-base text-muted">{EMPTY_TODOS_TEXT}</p>
            ) : null}
            {/* `TodoList` 가 선택 날짜를 메모리에 올린다(todo R17) — 화면에 **한 번만** 마운트한다. */}
            <TodoList date={date} categories={categories} />
          </>
        )}
      </div>

      {showBottomAdd && failureCard === null && !noCategories ? (
        <div className="shrink-0 border-t border-border bg-bg px-[var(--space-4)] py-[var(--space-2)]">
          <Button className="w-full" onClick={openFirstAddRow}>
            + 할 일
          </Button>
        </div>
      ) : null}
    </main>
  );
}
