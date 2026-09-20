// 사이드바에서 카테고리를 고르면 본문의 그 그룹으로 데려간다 (category §2-A "본문 그룹으로 스크롤").
//
// 그룹은 `<section aria-label="<카테고리 이름>">` 이다(`TodoGroupSection`). id 가 아니라 이름으로 찾는
// 이유는 그 컴포넌트가 이 티켓의 `owns` 밖이라 앵커를 붙일 수 없기 때문이다 — 핸드오프에 남긴다.
import { useCallback } from 'react';

import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';

import { revealAndFocus } from '@/lib/focus-fallback';

export function useCategoryFocus(categories: readonly Category[]): (id: CategoryId) => void {
  return useCallback(
    (id: CategoryId) => {
      const name = categories.find((category) => category.id === id)?.name;
      if (name === undefined) return;
      const groups = document.querySelectorAll<HTMLElement>('main section[aria-label]');
      const target = Array.from(groups).find(
        (section) => section.getAttribute('aria-label') === name,
      );
      if (target === undefined) return;
      // 목록 자체에 포커스를 주면(§5 의 `tabindex=-1` 목록) 다음 Tab 이 그 그룹 안에서 이어진다.
      revealAndFocus(target.querySelector<HTMLElement>('ul[tabindex="-1"]') ?? target);
    },
    [categories],
  );
}
