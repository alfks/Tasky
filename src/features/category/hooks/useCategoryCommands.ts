'use client';

// 카테고리 명령 등록 (shortcuts R7). 의존을 뒤집어 `category → command` 한 방향으로만 두는 이유는
// `todo/hooks/useTodoCommands.ts` 머리 주석과 같다(팔레트가 기능을 import 하면 런타임 순환).
//
// **사이드바는 한 순간 둘이 된다 — 그래서 등록을 인스턴스에 그대로 걸 수 없다.**
// `ShellSidebar` 는 컬럼과 드로어 두 자리에 살고, 폭이 넓어지는 프레임에서는 컬럼이 서는 동안
// 드로어가 아직 열려 있다(드로어를 닫는 `useShellPanels` 의 효과는 **자식 효과보다 나중에** 돈다).
// 그 한 커밋에 `CategoryList` 가 둘 마운트되므로 같은 id 가 두 번 등록되고, 개발 모드에서는
// `DuplicateCommandError` 가 `useEffect` 안에서 던져져 `#root` 가 통째로 빈다
// (T-17 `lib/duplicate-policy.ts` 주석이 경고한 바로 그 사고다).
//
// 그래서 마운트를 **쌓아 두고 맨 위 것**에게 실행을 넘기는 등록을 한 벌만 유지한다. 나중에 뜬 쪽이
// 사용자가 보고 있는 화면이다(드로어가 컬럼을 덮고 컬럼은 `inert` 가 된다). 마지막 하나가
// 언마운트되면 명령도 사라진다 — 아무도 대화상자를 그리지 않는데 팔레트에 남아 Enter 를 먹으면
// 조용히 아무 일도 일어나지 않는다.
import { useEffect, useRef } from 'react';

import { useCategoryStore } from '@/features/category/store/category-store';
import { useCommandStore, type Command } from '@/features/command';

export const CATEGORY_NEW_COMMAND_ID = 'category.new';

type Mount = { run: () => void };

/** 마운트된 `CategoryList` 들. 맨 뒤가 가장 나중에 뜬 것이다. */
const mounts: Mount[] = [];
let release: (() => void) | null = null;

/**
 * 목록을 아직 읽지 못했으면 만들기를 열지 않는다. 이름 유일성(category R2)과 개수 제한(R6)이
 * **빈 모집단**으로 돌아 "이미 있는 이름" 을 통과시키기 때문이다 — 화면의 `+ 카테고리 추가`
 * 버튼도 같은 이유로 적재 중에는 나오지 않는다(`CategoryList` 주석).
 */
function listIsReady(): boolean {
  return useCategoryStore.getState().status === 'ready';
}

export const categoryNewCommand: Command = {
  id: CATEGORY_NEW_COMMAND_ID,
  label: '새 카테고리',
  // 라벨에 없는 말만 싣는다 — `카테고리` 는 라벨에 있어 부분 일치로 이미 걸린다(R8).
  keywords: ['추가', '만들기', 'new category', 'add category'],
  when: listIsReady,
  run: () => mounts[mounts.length - 1]?.run(),
};

/** `CategoryList` 가 자기 만들기 대화상자를 여는 함수를 넘겨 부른다. */
export function useCategoryCommands(openCreate: () => void): void {
  const latest = useRef(openCreate);
  latest.current = openCreate;

  useEffect(() => {
    // 실행을 ref 로 한 번 우회한다 — 넘어온 함수는 매 렌더 새 참조지만 이 효과는 한 번만 돈다.
    const mount: Mount = { run: () => latest.current() };
    mounts.push(mount);
    if (mounts.length === 1) {
      release = useCommandStore.getState().registerCommands([categoryNewCommand]);
    }
    return () => {
      const at = mounts.indexOf(mount);
      if (at !== -1) mounts.splice(at, 1);
      if (mounts.length === 0) {
        release?.();
        release = null;
      }
    };
  }, []);
}
