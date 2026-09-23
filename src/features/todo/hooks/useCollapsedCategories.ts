// 카테고리 그룹 접힘 상태 (todo.md R22). 기기별 설정이라 localStorage 에만 산다 — shell 의
// `sidebarPinned`·`insightCollapsed`(shell-ui-store.ts)와 같은 이유로 저장소(IndexedDB) 백업에는
// 담기지 않는다. 기본은 **펼침** — 접은 카테고리의 id 만 기억한다(새 카테고리는 항상 펼쳐진 채 시작).
//
// 읽기·쓰기 전부 try/catch 다(ui-prefs.ts 와 같은 이유 — 사생활 보호 모드에서 접근 자체가 throw
// 할 수 있고, 그때는 "접힘을 기억하지 못한다" 가 앱이 죽는 것보다 맞는 실패다).
import { useCallback, useState } from 'react';

import type { CategoryId } from '@/domain/ids';

export const COLLAPSED_CATEGORIES_KEY = 'tasky.todo.collapsedCategories.v1';

function readCollapsed(): ReadonlySet<CategoryId> {
  try {
    const raw = window.localStorage.getItem(COLLAPSED_CATEGORIES_KEY);
    if (raw === null) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((id): id is CategoryId => typeof id === 'string'));
  } catch {
    return new Set();
  }
}

function writeCollapsed(ids: ReadonlySet<CategoryId>): void {
  try {
    window.localStorage.setItem(COLLAPSED_CATEGORIES_KEY, JSON.stringify([...ids]));
  } catch {
    // 저장하지 못해도 이번 세션의 화면은 그대로다. 다음 방문에 기본값(펼침)으로 열릴 뿐이다.
  }
}

export type CollapsedCategories = {
  isCollapsed: (id: CategoryId) => boolean;
  toggle: (id: CategoryId) => void;
};

/** 카테고리별 접힘 여부와 토글. 여러 그룹 섹션이 한 상태를 나눠 쓰도록 `TodoList` 가 한 번만 부른다. */
export function useCollapsedCategories(): CollapsedCategories {
  const [collapsed, setCollapsed] = useState<ReadonlySet<CategoryId>>(readCollapsed);

  const toggle = useCallback((id: CategoryId) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      writeCollapsed(next);
      return next;
    });
  }, []);

  const isCollapsed = useCallback((id: CategoryId) => collapsed.has(id), [collapsed]);

  return { isCollapsed, toggle };
}
