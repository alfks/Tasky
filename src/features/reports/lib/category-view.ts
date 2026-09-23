// 카테고리 비율 카드의 장식(이름·이모지·색)만 담당한다. **집계는 여기서 하지 않는다** — `summarizeByCategory`
// (completion-rate.ts, stats.md R3)의 결과를 그대로 받아 표시용 필드만 붙인다.
//
// 예전에는 `src/features/stats/completion-view.ts` 의 `toCategoryBars` 와 하는 일이 같았다(그
// 함수는 인사이트 패널의 "카테고리별" 막대 섹션이 폐지되며 함께 걷혔다 — 사용자 결정, todo.md
// R23). 그때도 `stats` 의 배럴에서 직접 가져올 수는 없었다: `useCompletion` 훅을 통해
// `@/features/todo` 를 끌고 들어와(그 훅이 투두 스토어를 구독한다) `todo → command` 로 이어져
// `command → reports → stats → todo → command` 순환이 됐다(`CommandPaletteCommands.tsx` 머리
// 주석의 표와 같은 문제). 그래서 이 작은 장식 함수는 지금도 domain 값 위에 별도로 둔다. 계산
// 자체(`summarizeByCategory`)는 절대 다시 하지 않는다.
//
// review m3(design review 라운드1) — 공용 위치로 올리는 세 갈래를 검토하고 전부 기각했다:
//   1) `src/components/ui/` 로 (행 렌더링까지) 승격 — `components/AGENTS.md` 규칙4가 "세 번째
//      사용처가 생길 때"만 승격하라고 명시한다. 지금 사용처는 `stats`·`reports` 둘뿐이다.
//   2) `src/lib/` 로 이 함수만 이동 — `lib/AGENTS.md` 는 "프레임워크·도메인 무관 순수 유틸"만
//      둔다고 못박는다. 이 함수는 `Category`·`CategoryCompletion`(둘 다 domain)에 의존해 그
//      계약을 깬다.
//   3) `reports` 가 `@/features/stats/completion-view` 를 배럴을 건너뛰고 직접(deep) import —
//      그 파일 자체엔 feature 의존이 없어 `import/no-cycle`은 통과하겠지만, 이 레포의 다른 모든
//      교차 feature 참조는 배럴을 거친다(barrel 이 캡슐화 경계다) — 이 파일 하나만 예외를 두면
//      다음에 `stats` 내부를 바꿀 때 `reports` 가 조용히 깨질 수 있는 숨은 결합을 남긴다.
// 남은 중복은 이 변환 함수(계산 없는 장식)뿐이고, **렌더링 쪽 중복이 실제로 버그였던 부분**
// (막대 전환 애니메이션 누락)은 `CategoryRatioCard.tsx` 에서 직접 고쳤다.
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
