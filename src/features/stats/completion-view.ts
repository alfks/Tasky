// 달성률 화면 모델 (completion-rate.md R1~R4). 계산은 전부 `@/domain/todo/completion-rate` 가 하고
// 여기서는 그 결과를 화면이 그대로 쓸 모양(문구)으로만 바꾼다. 비율을 여기서 다시 세면
// 헤더 링·탭 제목·날짜 스트립 배지가 조용히 갈린다(R8 "세 곳은 같은 함수의 결과").
import {
  type CompletionCounts,
  completionCounts,
  completionPercent,
  completionRate,
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

/** 투두 0개(또는 조회 실패)일 때 링이 읽히는 문구 (§5). */
export const EMPTY_RING_LABEL = '오늘 할 일 없음';

/** 100% 도달 순간에만 붙는 문구 (R4). */
export const CELEBRATION_TEXT = '다 했어요 🎉';

/**
 * 낭독용 축하 문구 (R4). 이모지를 뺀 이유는 AT 가 🎉 를 "파티 폭죽" 으로 읽어
 * 라이브 영역에 소음이 되기 때문이다 — 화면에는 이모지가 그대로 붙는다(`CELEBRATION_TEXT`).
 */
const CELEBRATION_ANNOUNCEMENT = '다 했어요';

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

/**
 * `aria-live` 영역이 1회 낭독할 문구 (§5). 링 문구보다 짧게 — 토글마다 읽히는 자리다.
 *
 * 100% 에서만 축하 문구를 함께 싣는다: R4 의 보상 중 펄스는 장식이라 빼도 되지만 **문구는 정보**이고,
 * 화면의 `다 했어요 🎉` 는 라이브 영역 밖 평범한 `<span>` 이라 그대로 두면 시각 사용자에게만 도착한다.
 */
export function completionAnnouncement(summary: CompletionSummary): string {
  if (summary.percent === null) {
    return EMPTY_RING_LABEL;
  }
  const percent = `달성률 ${summary.percent}%`;
  return summary.rate === 1 ? `${percent}, ${CELEBRATION_ANNOUNCEMENT}` : percent;
}
