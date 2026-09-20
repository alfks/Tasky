// 카테고리 비율 카드의 장식(이름·이모지·색)만 담당한다. **집계는 여기서 하지 않는다** — `summarizeByCategory`
// (completion-rate.ts, stats.md R3)의 결과를 그대로 받아 표시용 필드만 붙인다.
//
// `src/features/stats/completion-view.ts` 의 `toCategoryBars` 와 하는 일이 같지만, `stats` 의
// 배럴은 `useCompletion` 훅을 통해 `@/features/todo` 를 끌고 들어온다(그 훅이 투두 스토어를
// 구독한다) — `todo → command` 로 이어져 `command → reports → stats → todo → command` 순환이
// 된다(`CommandPaletteCommands.tsx` 머리 주석의 표와 같은 문제). 그래서 이 작은 장식 함수만
// domain 값 위에 별도로 둔다. 계산 자체(`summarizeByCategory`)는 절대 다시 하지 않는다.
import type { Category } from '@/domain/category/category';
import { isTombstone } from '@/domain/meta';
import type { CategoryCompletion } from '@/domain/todo/completion-rate';

export type CategoryBarView = CategoryCompletion & {
  /** 이름 텍스트이자 막대의 접근 이름. 삭제된 카테고리는 "(삭제됨)" 이 붙는다. */
  label: string;
  emoji?: string;
  /** 카테고리 행 자체가 없을 때만 비어 있고, 그때 컴포넌트가 `--color-faint` 로 떨어진다. */
  color?: string;
  /** 막대 채움 비율 0~1. */
  ratio: number;
};

const DELETED_SUFFIX = '(삭제됨)';
const UNKNOWN_CATEGORY_LABEL = '삭제된 카테고리';

/** `summarizeByCategory` 결과에 카테고리 이름·이모지·색을 붙인다(stats.md R3). */
export function toCategoryBarView(
  counts: readonly CategoryCompletion[],
  categories: readonly Category[],
): CategoryBarView[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return counts.map((count) => {
    const category = byId.get(count.categoryId);
    const ratio = count.total === 0 ? 0 : count.done / count.total;
    if (category === undefined) {
      return { ...count, label: UNKNOWN_CATEGORY_LABEL, ratio };
    }
    return {
      ...count,
      label: isTombstone(category) ? `${category.name} ${DELETED_SUFFIX}` : category.name,
      emoji: category.emoji,
      color: category.color,
      ratio,
    };
  });
}

/** 막대의 `aria-valuetext`(completion-rate.md §5 와 같은 문구 패턴). */
export function categoryBarViewValueText(bar: CategoryBarView): string {
  return `${bar.total}개 중 ${bar.done}개 완료`;
}
