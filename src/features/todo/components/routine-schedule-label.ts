// 루틴 관리 화면 행의 표시 문구 (routine.md §2·§5) — 순수 포매팅만, 도메인 판정은 하지 않는다.
// `RoutineManagerRow` 하나만 쓰지만 컴포넌트 본문 길이를 줄이려고 뗐다(code-style §2).
import type { Routine } from '@/domain/routine/routine';
import type { RoutineRecurrence } from '@/domain/todo/routine.rules';

import { fromDateKey } from '@/lib/date';

const WEEKDAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * "매주 금·토" / "매달 1, 15일". `RoutineDialog`(T-82)가 이미 오름차순으로 저장한 순서를 그대로
 * 쓴다 — 여기서 다시 정렬하지 않는다.
 */
export function recurrenceSummary(recurrence: RoutineRecurrence): string {
  if (recurrence.type === 'weekly') {
    return `매주 ${recurrence.daysOfWeek.map((day) => WEEKDAY_LABELS[day]).join('·')}`;
  }
  return `매달 ${recurrence.daysOfMonth.join(', ')}일`;
}

/**
 * "계속" / "~10/4" / "중지됨" — 색이 아니라 텍스트로 상태를 병기한다(routine.md §5). 종료일이 있는
 * 루틴은 그 날짜 자체가 상태다 — 중지·재개가 없는 루틴이라(R7-a) "중지됨"이 될 일이 없다.
 */
export function routineStatusLabel(routine: Routine): string {
  if (routine.endDate !== undefined) {
    const at = fromDateKey(routine.endDate);
    return `~${at.getMonth() + 1}/${at.getDate()}`;
  }
  return routine.active ? '계속' : '중지됨';
}

/** 행 한 줄 요약: "매주 금·토 · 계속". */
export function routineScheduleLabel(routine: Routine): string {
  return `${recurrenceSummary(routine.recurrence)} · ${routineStatusLabel(routine)}`;
}
