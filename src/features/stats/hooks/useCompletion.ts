// 달성률 훅. 투두 스토어에서 참조가 안정적인 `byId` 만 구독하고 파생 계산은 렌더 중에 한다
// (code-style §3 "파생 값은 렌더 중 계산", §4 "selector 로 조각만 구독").
import type { Todo } from '@/domain/todo/todo';

import { type CompletionSummary, summarizeCompletion } from '@/features/stats/completion-view';
import { useTodoStore } from '@/features/todo';

/**
 * 달성률이 볼 투두 목록. 조회에 실패했으면(`status === 'error'`) 직전 날짜의 값이 메모리에 남아
 * 있어도 쓰지 않는다 — 화면은 `—` 다(completion-rate.md §2 상태 "에러"). 적재 중(`loading`)은
 * 반대로 이전 값을 그대로 둔다(같은 문단 "로딩": 별도 스켈레톤 없음).
 */
function useVisibleTodos(): Todo[] {
  const byId = useTodoStore((state) => state.byId);
  const status = useTodoStore((state) => state.status);
  return status === 'error' ? [] : Object.values(byId);
}

/**
 * 선택 날짜의 달성률 (R1~R3). 헤더 링·패널 링·탭 제목·날짜 스트립 배지는 **전부 이 값**을 써야
 * 서로 갈리지 않는다(R8) — 호출부가 비율을 다시 세지 않는다.
 */
export function useCompletion(): CompletionSummary {
  return summarizeCompletion(useVisibleTodos());
}
