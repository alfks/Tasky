'use client';

// 투두 명령 등록 (shortcuts R7 — "명령은 각 기능이 `{id,label,keywords,shortcut?,run,when?}` 로 등록한다").
//
// **왜 팔레트가 아니라 여기인가.** `command` 가 `todo` 를 import 하면 `command → todo → command` 순환이다
// (`TodoList` 가 단축키 때문에 `@/features/command` 를 쓴다). 그 순환은 린트가 아니라 **런타임 초기화**
// 에서 터진다(T-19 실측: `Cannot access '__vite_ssr_import_2__' before initialization`). 화살표를
// `todo → command` 한 방향으로만 두면 순환이 없고, 팔레트는 레지스트리를 **읽기만** 하므로 팔레트
// 코드는 한 줄도 바뀌지 않는다 — 그것이 R7 이 등록을 기능 쪽에 둔 이유다.
//
// **등록의 수명 = `TodoList` 의 수명.** 입력 행을 여는 상태(`addOpenFor`)는 그 컴포넌트 안에 있다.
// 언마운트된 뒤에도 명령이 레지스트리에 남으면 팔레트에서 Enter 를 먹고 **아무 일도 일어나지 않는다**.
import { useEffect, useRef } from 'react';

import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';

import { useCommandStore, type Command } from '@/features/command';

/** 명령 id 접두사. 카테고리마다 하나씩 등록한다(R7 "새 할 일(활성 카테고리별)"). */
export const TODO_NEW_COMMAND_PREFIX = 'todo.new:';

/** 팔레트에 보이는 이름 (§2 스케치의 `+ 새 할 일 (<카테고리>)`). */
export function todoNewCommandLabel(categoryName: string): string {
  return `새 할 일 (${categoryName})`;
}

/**
 * 활성 카테고리 하나당 명령 하나. 순수 함수라 훅 없이 그대로 검증할 수 있다.
 *
 * `when` 을 따로 두지 않는 이유: 카테고리가 0개면 이 목록 자체가 비어서 R7 의 "카테고리 0개면
 * 거짓" 이 이미 성립한다. 조건을 한 번 더 쓰면 같은 판정의 출처가 둘이 된다.
 */
export function buildTodoCommands(
  categories: readonly Category[],
  openAddRow: (categoryId: CategoryId) => void,
): Command[] {
  return categories.map((category, index) => ({
    id: `${TODO_NEW_COMMAND_PREFIX}${category.id}`,
    label: todoNewCommandLabel(category.name),
    // 카테고리 이름은 **라벨에 이미 있어** 부분 일치로 걸린다(R8) — 키워드에 또 넣지 않는다.
    // 여기 있는 것은 라벨에 없는 말뿐이다: `추가`·`new`·`add`.
    keywords: ['추가', 'new', 'add'],
    // `N` 은 **첫** 활성 카테고리의 입력 행만 연다(R1). 나머지 줄에 같은 조합을 그리면 거짓말이다.
    ...(index === 0 ? { shortcutId: 'todo.new' as const } : {}),
    run: () => openAddRow(category.id),
  }));
}

/**
 * `TodoList` 가 한 번 부른다(그 컴포넌트는 화면에 한 번만 마운트된다 — todo R17).
 *
 * 카테고리 목록은 매 렌더 새 배열이라 그대로 의존성에 넣으면 등록 → 해제 → 등록이 반복되고,
 * 그 틈에 팔레트의 `runCommand` 가 오면 명령이 **없다**. 이름·순서를 문자열로 굳혀 그것이 바뀔
 * 때만 다시 등록한다.
 */
export function useTodoCommands(
  categories: readonly Category[],
  openAddRow: (categoryId: CategoryId) => void,
): void {
  const latest = useRef({ categories, openAddRow });
  latest.current = { categories, openAddRow };

  const signature = JSON.stringify(categories.map((category) => [category.id, category.name]));

  useEffect(() => {
    const { categories: list, openAddRow: open } = latest.current;
    return useCommandStore
      .getState()
      .registerCommands(buildTodoCommands(list, (categoryId) => open(categoryId)));
    // `signature` 가 곧 `categories` 의 내용이다 — 배열 자체를 넣으면 매 렌더 재등록된다.
  }, [signature]);
}
