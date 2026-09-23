// `categories`(활성+종료, `useCategories()`)에 없는 categoryId 를 참조하는 투두가 메모리에 있으면
// tombstone 을 마저 읽어 붙인다 (ADR-0014, category R17·R22).
//
// **왜 셸에서 한 번만 계산하나.** 본문 목록(`selectGroups`)을 그리는 여러 자리가 같은 값을 받아야
// "삭제된 카테고리" 그룹의 이름·색이 갈리지 않는다 — 각자 조회하면 한쪽만 tombstone 을 못 찾고
// 실패하는 날 화면마다 다른 이름을 보여준다. `AppShell` 은 feature 들이 처음 서로를 보는 자리라
// (app-shell.md, 파일 머리말) 여기서 `todo` 스토어와 `category` 저장소를 함께 참조해도 feature 간
// 결합이 늘지 않는다 — 각 feature 는 여전히 서로를 모른다.
//
// **선택지·팔레트에는 이 결과를 넘기지 않는다** — `categories.list()` 원본을 그대로 쓴다
// (category R17 "선택지·팔레트에 없음"). 인사이트 패널에는 더 이상 카테고리를 보여주는 섹션이
// 없다(카테고리별 달성률은 이제 각 그룹 헤더에서 보인다) — 그 프롭도 걷어냈다.
import { useEffect, useState } from 'react';

import type { Category } from '@/domain/category/category';
import type { CategoryId } from '@/domain/ids';

import { getRepositories } from '@/repositories/container';

import { useTodoStore } from '@/features/todo';

/**
 * `categories` 에 tombstone 을 필요한 만큼만 덧붙인 목록. `historyHidden`(category R22, 삭제
 * 시점에 "지난 기록에서도 이름·색 지우기"를 고른 카테고리)은 제외한다 — 지워도 여전히 못 찾은
 * 채로 남아 일반 "삭제된 카테고리" 표시로 자연히 떨어진다.
 *
 * 실패해도(조회 오류) 별도 처리는 하지 않는다 — `categories` 그대로 돌려주면 호출부가 기존
 * 폴백(일반 라벨)으로 자연히 떨어진다.
 */
export function useCategoriesWithHistory(categories: readonly Category[]): readonly Category[] {
  // `byId` 는 쓰기가 없으면 참조가 그대로다(todo-state.ts 주석) — 렌더 중 계산은 `useTodoGroups` 와
  // 같은 패턴이라 여기서 매 렌더 다시 훑어도 참조 안정성에는 영향이 없다.
  const byId = useTodoStore((state) => state.byId);
  const knownIds = new Set(categories.map((category) => category.id));
  const missing = [...new Set(Object.values(byId).map((todo) => todo.categoryId))]
    .filter((id) => !knownIds.has(id))
    .sort();
  const missingKey = missing.join(',');

  const [resolved, setResolved] = useState<{ key: string; deleted: readonly Category[] }>({
    key: '',
    deleted: [],
  });

  useEffect(() => {
    if (missing.length === 0) {
      setResolved({ key: missingKey, deleted: [] });
      return;
    }
    let cancelled = false;
    void getRepositories()
      .categories.listDeletedByIds(missing as CategoryId[])
      .then((deleted) => {
        if (!cancelled) setResolved({ key: missingKey, deleted });
      })
      .catch(() => {
        // 실패해도 기존 폴백(일반 "삭제된 카테고리" 라벨)으로 자연히 떨어진다 — 별도 오류 처리 없음.
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- missingKey 가 배열 정체성 대신 값을 비교한다.
  }, [missingKey]);

  if (resolved.key !== missingKey) return categories;
  const visible = resolved.deleted.filter((category) => category.historyHidden !== true);
  return visible.length === 0 ? categories : [...categories, ...visible];
}
