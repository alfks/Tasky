// 집중 시간 합계 (stats.md R5). `FocusSession.elapsedSeconds` 를 날짜·투두·카테고리 기준으로
// 더하는 신규 domain 함수. 기간 안의 세션을 한 번에 읽어 넘기는 것은 호출부(`FocusSessionRepository.
// listByDateRange`, stats.md R7) 몫이고, 여기서는 이미 읽어 온 배열을 순수하게 집계만 한다.
import type { FocusSession } from '@/domain/focus/focus-session';

/** 그룹 기준. 날짜별 추이, 투두별·카테고리별 상위 항목을 같은 함수로 만든다. */
export type FocusSummaryBy = 'day' | 'todo' | 'category';

/** `todoId`·`categoryId` 가 없는 세션("할 일 없이 집중")이 모이는 버킷 키. */
export const FOCUS_SUMMARY_NONE_KEY = '(none)';

function keyOf(session: FocusSession, by: FocusSummaryBy): string {
  if (by === 'day') return session.date;
  if (by === 'todo') return session.todoId ?? FOCUS_SUMMARY_NONE_KEY;
  return session.categoryId ?? FOCUS_SUMMARY_NONE_KEY;
}

/**
 * 완료·취소된 세션의 `elapsedSeconds` 를 `by` 기준으로 더한다(R5).
 *
 * `running`·`paused` 는 제외한다 — 아직 확정되지 않은 경과라, 집계에 넣으면 초 단위가 계속 바뀌는
 * 값을 통계에 섞게 된다(focus-session.ts `elapsedSeconds` 주석: "끝나기 전에는 마지막으로 계산된 값").
 */
export function summarizeFocusSeconds(
  sessions: readonly FocusSession[],
  by: FocusSummaryBy,
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const session of sessions) {
    if (session.status !== 'completed' && session.status !== 'canceled') continue;
    const key = keyOf(session, by);
    totals.set(key, (totals.get(key) ?? 0) + session.elapsedSeconds);
  }
  return totals;
}
