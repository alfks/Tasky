// 달성률 화면 모델 (completion-rate.md R1~R5). 계산은 전부 `@/domain/todo/completion-rate` 가 하고
// 여기서는 그 결과를 화면이 그대로 쓸 모양(문구·막대 비율)으로만 바꾼다. 비율을 여기서 다시 세면
// 헤더 링·탭 제목·날짜 스트립 배지가 조용히 갈린다(R8 "세 곳은 같은 함수의 결과").
import type { Category } from '@/domain/category/category';
import { isTombstone } from '@/domain/meta';
import {
  type CategoryCompletion,
  type CompletionCounts,
  completionCounts,
  completionPercent,
  completionRate,
  summarizeByCategory,
} from '@/domain/todo/completion-rate';
import type { Todo } from '@/domain/todo/todo';

/** 링과 숫자가 함께 쓰는 한 날의 달성률. */
export type CompletionSummary = CompletionCounts & {
  /**
   * 반올림 전 비율 — 링 각도의 원천이다(R3). 투두가 0개면 비율이 정의되지 않아 `null` 이고(R1),
   * 목록 조회에 실패했을 때도 호출부가 빈 목록을 넘겨 같은 자리로 떨어진다(§2 상태 "에러").
   */
  rate: number | null;
  /** 표기용 퍼센트(R2). `null` 이면 화면은 `—` 를 쓴다. */
  percent: number | null;
};

/** 카테고리별 막대 한 줄 (R5). `summarizeByCategory` 가 준 순서를 그대로 유지한다. */
export type CategoryBar = CategoryCompletion & {
  /** 이름 텍스트이자 막대의 접근 이름. 삭제된 카테고리는 `(삭제됨)` 이 붙는다(R5). */
  label: string;
  /** 이름 앞 이모지(장식 — 정보는 `label` 과 숫자가 전달한다). */
  emoji?: string;
  /**
   * 막대 색(저장된 라이트 HEX). 카테고리 행 자체가 사라져 색을 모를 때만 비어 있고,
   * 그때는 컴포넌트가 `--color-faint` 로 떨어진다.
   */
  color?: string;
  /** 막대 채움 비율 0~1. 링과 같이 반올림 전 값이다(R3). */
  ratio: number;
};

const DELETED_SUFFIX = '(삭제됨)';

/** 카테고리 행이 남아 있지 않아 이름조차 모를 때(category R17 의 잔여 완료 투두). */
const UNKNOWN_CATEGORY_LABEL = '삭제된 카테고리';

/** 투두 0개(또는 조회 실패)일 때 링이 읽히는 문구 (§5). */
export const EMPTY_RING_LABEL = '오늘 할 일 없음';

/** 카테고리별 목록이 비었을 때의 안내 (§2 상태). */
export const EMPTY_CATEGORY_MESSAGE = '오늘 적은 할 일이 없어요';

/** 100% 도달 순간에만 붙는 문구 (R4). */
export const CELEBRATION_TEXT = '다 했어요 🎉';

/** 그날의 달성률. `todos` 는 선택 날짜의 삭제되지 않은 투두 전부다(카테고리 상태 무관 — R1). */
export function summarizeCompletion(todos: readonly Todo[]): CompletionSummary {
  return {
    ...completionCounts(todos),
    rate: completionRate(todos),
    percent: completionPercent(todos),
  };
}

/** 링이 읽히는 문구 (§5). 숫자를 문구에 넣어 그래픽만 남지 않게 한다. */
export function completionRingLabel(summary: CompletionSummary): string {
  if (summary.percent === null) {
    return EMPTY_RING_LABEL;
  }
  return `오늘 달성률 ${summary.percent}퍼센트, ${summary.total}개 중 ${summary.done}개 완료`;
}

/** 화면에 찍는 퍼센트 텍스트. 비율이 없으면 `—`(R1). */
export function completionPercentText(summary: CompletionSummary): string {
  return summary.percent === null ? '—' : `${summary.percent}%`;
}

/** 완료/전체 텍스트. `—` 상태에서도 분모를 보여 준다(§2 의 `0 / 0`). */
export function completionCountText(summary: CompletionSummary): string {
  return `${summary.done} / ${summary.total}`;
}

/** `aria-live` 영역이 1회 낭독할 문구 (§5). 링 문구보다 짧게 — 토글마다 읽히는 자리다. */
export function completionAnnouncement(summary: CompletionSummary): string {
  return summary.percent === null ? EMPTY_RING_LABEL : `달성률 ${summary.percent}%`;
}

/** 막대의 `aria-valuetext`. `3 of 5` 대신 한국어로 읽히게 한다(§5 "숫자 병기"). */
export function categoryBarValueText(bar: CategoryBar): string {
  return `${bar.total}개 중 ${bar.done}개 완료`;
}

/**
 * 카테고리별 막대 데이터 (R5). 순서·필터(그날 투두가 있는 카테고리만)는 전부
 * `summarizeByCategory` 가 정하고, 여기서는 이름·이모지·색만 붙인다.
 */
export function toCategoryBars(
  todos: readonly Todo[],
  categories: readonly Category[],
): CategoryBar[] {
  const byId = new Map(categories.map((category) => [category.id, category]));
  return summarizeByCategory(todos, categories).map((counts) => {
    const category = byId.get(counts.categoryId);
    const ratio = counts.total === 0 ? 0 : counts.done / counts.total;
    if (category === undefined) {
      return { ...counts, label: UNKNOWN_CATEGORY_LABEL, ratio };
    }
    return {
      ...counts,
      label: isTombstone(category) ? `${category.name} ${DELETED_SUFFIX}` : category.name,
      emoji: category.emoji,
      color: category.color,
      ratio,
    };
  });
}
